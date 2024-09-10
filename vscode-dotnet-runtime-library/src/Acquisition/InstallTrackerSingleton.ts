/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as lockfile from 'proper-lockfile';
import * as path from 'path';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import {
    AddTrackingVersions,
    ConvertingLegacyInstallRecord,
    DotnetAcquisitionInProgress,
    DotnetAcquisitionStatusResolved,
    DotnetLockAttemptingAcquireEvent,
    DotnetLockErrorEvent,
    DotnetLockReleasedEvent,
    DotnetPreinstallDetected,
    DotnetPreinstallDetectionError,
    DuplicateInstallDetected,
    EventBasedError,
    FoundTrackingVersions,
    NoMatchingInstallToStopTracking,
    RemovingExtensionFromList,
    RemovingOwnerFromList,
    RemovingVersionFromExtensionState,
    SkipAddingInstallEvent
} from '../EventStream/EventStreamEvents';
import {
    DotnetInstall,
    DotnetInstallWithKey,
    GetDotnetInstallInfo,
    InstallToStrings,
    IsEquivalentInstallation,
    IsEquivalentInstallationFile
} from './DotnetInstall';
import { getVersionFromLegacyInstallId, getAssumedInstallInfo } from '../Utils/InstallIdUtilities';
import { InstallRecord, InstallRecordOrStr } from './InstallRecord';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { IEventStream } from '../EventStream/EventStream';
import { IExtensionState } from '../IExtensionState';
import { IDotnetAcquireContext } from '..';
/* tslint:disable:no-any */


interface InProgressInstall
{
    dotnetInstall: DotnetInstall;
    // The string is the path of the install once completed.
    installingPromise: Promise<string>;
}


export class InstallTrackerSingleton
{
    protected static instance: InstallTrackerSingleton;

    protected inProgressInstalls: Set<InProgressInstall> = new Set<InProgressInstall>();
    private readonly installingVersionsId = 'installing';
    private readonly installedVersionsId = 'installed';

    protected constructor(protected eventStream : IEventStream, protected extensionState : IExtensionState)
    {

    }

    public static getInstance(eventStream : IEventStream, extensionState : IExtensionState) : InstallTrackerSingleton
    {
        if(!InstallTrackerSingleton.instance)
        {
            InstallTrackerSingleton.instance = new InstallTrackerSingleton(eventStream, extensionState);
        }

        return InstallTrackerSingleton.instance;
    }

    protected overrideMembers(eventStream : IEventStream, extensionState : IExtensionState)
    {
        InstallTrackerSingleton.instance.eventStream = eventStream;
        InstallTrackerSingleton.instance.extensionState = extensionState;
    }

    protected executeWithLock = async <A extends any[], R>(alreadyHoldingLock : boolean, dataKey : string, f: (...args: A) => R, ...args: A): Promise<R> =>
    {
        const trackingLock = `${dataKey}.lock`;
        const lockPath = path.join(__dirname, trackingLock);
        fs.writeFileSync(lockPath, '', 'utf-8');

        let returnResult : any;

        try
        {
            if(alreadyHoldingLock)
            {
                // eslint-disable-next-line @typescript-eslint/await-thenable
                return await f(...(args));
            }
            else
            {
                this.eventStream?.post(new DotnetLockAttemptingAcquireEvent(`Lock Acquisition request to begin.`, new Date().toISOString(), lockPath, lockPath));
                await lockfile.lock(lockPath, { retries: { retries: 10, minTimeout: 5, maxTimeout: 10000 } })
                .then(async (release) =>
                {
                    // eslint-disable-next-line @typescript-eslint/await-thenable
                    returnResult = await f(...(args));
                    this.eventStream?.post(new DotnetLockReleasedEvent(`Lock about to be released.`, new Date().toISOString(), lockPath, lockPath));
                    return release();
                })
                .catch((e : Error) =>
                {
                    // Either the lock could not be acquired or releasing it failed
                    this.eventStream?.post(new DotnetLockErrorEvent(e, e.message, new Date().toISOString(), lockPath, lockPath));
                });
            }
        }
        catch(e : any)
        {
            // Either the lock could not be acquired or releasing it failed

            // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            this.eventStream.post(new DotnetLockErrorEvent(e, e?.message ?? 'Unable to acquire lock to update installation state', new Date().toISOString(), lockPath, lockPath));

            // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            throw new EventBasedError('DotnetLockErrorEvent', e?.message, e?.stack);
        }

        return returnResult;
    }

    public clearPromises() : void
    {
        this.inProgressInstalls.clear();
    }

    /**
     *
     * @param install the install id to get a working install promise for.
     */
    public async getPromise(install : DotnetInstall, acquisitionContext : IDotnetAcquireContext, disableOutput = false) : Promise<string | null>
    {
        for(const x of this.inProgressInstalls)
        {
            const xAsId = x.dotnetInstall as DotnetInstall;
            if(IsEquivalentInstallationFile(xAsId, install))
            {
                this.eventStream.post(new DotnetAcquisitionStatusResolved(install, install.version));

                if(!disableOutput)
                {
                    this.eventStream.post(new DotnetAcquisitionInProgress(install,
                        (acquisitionContext && acquisitionContext.requestingExtensionId)
                        ? acquisitionContext.requestingExtensionId : 'unknown'));
                }
                const result = await x.installingPromise;
                return result;
            }
        }
        return null;
    }

    public addPromise(install : DotnetInstall, installPromise : Promise<string>) : void
    {
        this.inProgressInstalls.add({ dotnetInstall: install, installingPromise: installPromise });
    }

    protected removePromise(install : DotnetInstall) : void
    {
        const resolvedInstall : InProgressInstall | undefined = [...this.inProgressInstalls].find(x => IsEquivalentInstallation(x.dotnetInstall as DotnetInstall, install));
        if(!resolvedInstall)
        {
            this.eventStream.post(new NoMatchingInstallToStopTracking(`No matching install to stop tracking for ${install.installId}.
    Installs: ${[...this.inProgressInstalls].map(x => x.dotnetInstall.installId).join(', ')}`));
            return;
        }
        this.inProgressInstalls.delete(resolvedInstall);
    }

    public async canUninstall(isFinishedInstall : boolean, dotnetInstall : DotnetInstall, allowUninstallUserOnlyInstall = false) : Promise<boolean>
    {
        return this.executeWithLock( false, this.installedVersionsId, async (id: string, install: DotnetInstall) =>
        {
            this.eventStream.post(new RemovingVersionFromExtensionState(`Removing ${JSON.stringify(install)} with id ${id} from the state.`));
            const existingInstalls = await this.getExistingInstalls(id === this.installedVersionsId, true);
            const installRecord = existingInstalls.filter(x => IsEquivalentInstallation(x.dotnetInstall, install));

            return installRecord.length === 0 || installRecord[0]?.installingExtensions?.length === 0 ||
                (allowUninstallUserOnlyInstall && installRecord[0]?.installingExtensions?.length === 1 && installRecord[0]?.installingExtensions?.includes('user'));
        }, isFinishedInstall ? this.installedVersionsId : this.installingVersionsId, dotnetInstall);
    }

    public async uninstallAllRecords() : Promise<void>
    {
        await this.executeWithLock( false, this.installingVersionsId, async () =>
        {
            // This does not uninstall global things yet, so don't remove their ids.
            const installingVersions = await this.getExistingInstalls(false, true);
            const remainingInstallingVersions = installingVersions.filter(x => x.dotnetInstall.isGlobal);
            await this.extensionState.update(this.installingVersionsId, remainingInstallingVersions);
        }, );

        return this.executeWithLock( false, this.installedVersionsId, async () =>
        {
            const installedVersions = await this.getExistingInstalls(true, true);
            const remainingInstalledVersions = installedVersions.filter(x => x.dotnetInstall.isGlobal);
            await this.extensionState.update(this.installedVersionsId, remainingInstalledVersions);
        }, );
    }

    /**
     *
     * @param getAlreadyInstalledVersions - Whether to get the versions that are already installed. If true, gets installed, if false, gets what's still being installed / installing.
     */
    public async getExistingInstalls(getAlreadyInstalledVersion : boolean, alreadyHoldingLock = false) : Promise<InstallRecord[]>
    {
        return this.executeWithLock( alreadyHoldingLock, getAlreadyInstalledVersion ? this.installedVersionsId : this.installingVersionsId,
            (getAlreadyInstalledVersions : boolean) =>
        {
            const extensionStateAccessor = getAlreadyInstalledVersions ? this.installedVersionsId : this.installingVersionsId;
            const existingInstalls = this.extensionState.get<InstallRecordOrStr[]>(extensionStateAccessor, []);
            const convertedInstalls : InstallRecord[] = [];

            existingInstalls.forEach((install: InstallRecordOrStr) =>
            {
                if(typeof install === 'string')
                {
                    this.eventStream.post(new ConvertingLegacyInstallRecord(`Converting legacy install record ${install} to a null owner. Assuming:
                    ${JSON.stringify(InstallToStrings(getAssumedInstallInfo(install, null)))}`));
                    convertedInstalls.push(
                        {
                            dotnetInstall: getAssumedInstallInfo(install, null),
                            installingExtensions: [ null ],
                        } as InstallRecord
                    );
                }
                else if(install.dotnetInstall.hasOwnProperty('installKey'))
                {
                    convertedInstalls.push(
                        {
                            dotnetInstall: {
                                installId: (install.dotnetInstall as DotnetInstallWithKey).installKey,
                                version: install.dotnetInstall.version,
                                architecture: install.dotnetInstall.architecture,
                                isGlobal: install.dotnetInstall.isGlobal,
                                installMode: install.dotnetInstall.installMode
                            } as DotnetInstall,
                            installingExtensions: install.installingExtensions,
                        } as InstallRecord
                    )
                }
                else if(!install.dotnetInstall.hasOwnProperty('installId') && !install.dotnetInstall.hasOwnProperty('installKey'))
                {
                    ; // This is a corrupted install which was cast to the incorrect type. We can install on top of it without causing a problem, lets get rid of this record.
                }
                else
                {
                    convertedInstalls.push(install as InstallRecord);
                }
            });

            this.extensionState.update(extensionStateAccessor, convertedInstalls);

            this.eventStream.post(new FoundTrackingVersions(`${getAlreadyInstalledVersions ? this.installedVersionsId : this.installingVersionsId} :
${convertedInstalls.map(x => `${JSON.stringify(x.dotnetInstall)} owned by ${x.installingExtensions.map(owner => owner ?? 'null').join(', ')}\n`)}`));
            return convertedInstalls;
        }, getAlreadyInstalledVersion);
    }


    public async reclassifyInstallingVersionToInstalled(context : IAcquisitionWorkerContext, install : DotnetInstall)
    {
        await this.untrackInstallingVersion(context, install);
        await this.trackInstalledVersion(context, install);
    }

    public async untrackInstallingVersion(context : IAcquisitionWorkerContext, install : DotnetInstall, force = false)
    {
        await this.removeVersionFromExtensionState(context, this.installingVersionsId, install, force);
        this.removePromise(install);
    }

    public async untrackInstalledVersion(context : IAcquisitionWorkerContext, install : DotnetInstall, force = false)
    {
        await this.removeVersionFromExtensionState(context, this.installedVersionsId, install, force);
    }

    protected async removeVersionFromExtensionState(context : IAcquisitionWorkerContext, idStr: string, installIdObj: DotnetInstall, forceUninstall = false)
    {
        return this.executeWithLock( false, idStr, async (id: string, install: DotnetInstall) =>
        {
            this.eventStream.post(new RemovingVersionFromExtensionState(`Removing ${JSON.stringify(install)} with id ${id} from the state.`));
            const existingInstalls = await this.getExistingInstalls(id === this.installedVersionsId, true);
            const installRecord = existingInstalls.filter(x => IsEquivalentInstallation(x.dotnetInstall, install));

            if(installRecord)
            {
                if(installRecord.length > 1)
                {
                    this.eventStream.post(new DuplicateInstallDetected(`The install ${(JSON.stringify(install))} has a duplicated record ${installRecord.length} times in the extension state.
${installRecord.map(x => `${x.installingExtensions.join(' ')} ${JSON.stringify(InstallToStrings(x.dotnetInstall))}`)}\n`));
                }

                const preExistingRecord = installRecord.at(0);
                const owners = preExistingRecord?.installingExtensions.filter(x => x !== context.acquisitionContext?.requestingExtensionId);
                if(forceUninstall || (owners?.length ?? 0) < 1)
                {
                    // There are no more references/extensions that depend on this install, so remove the install from the list entirely.
                    // For installing versions, there should only ever be 1 owner.
                    // For installed versions, there can be N owners.
                    this.eventStream.post(new RemovingExtensionFromList(forceUninstall ? `At the request of ${context.acquisitionContext?.requestingExtensionId}, we force uninstalled ${JSON.stringify(install)}.` :
                        `The last owner ${context.acquisitionContext?.requestingExtensionId} removed ${JSON.stringify(install)} entirely from the state.`));
                    await this.extensionState.update(id, existingInstalls.filter(x => !IsEquivalentInstallation(x.dotnetInstall, install)));
                }
                else
                {
                    // There are still other extensions that depend on this install, so merely remove this requesting extension from the list of owners.
                    this.eventStream.post(new RemovingOwnerFromList(`The owner ${context.acquisitionContext?.requestingExtensionId} removed ${JSON.stringify(install)} itself from the list, but ${owners?.join(', ')} remain.`));
                    await this.extensionState.update(id, existingInstalls.map(x => IsEquivalentInstallation(x.dotnetInstall, install) ?
                        { dotnetInstall: install, installingExtensions: owners } as InstallRecord : x));
                }
            }
        }, idStr, installIdObj);
    }

    public async trackInstallingVersion(context : IAcquisitionWorkerContext, install: DotnetInstall)
    {
        await this.addVersionToExtensionState(context, this.installingVersionsId, install);
    }

    public async trackInstalledVersion(context : IAcquisitionWorkerContext, install: DotnetInstall)
    {
        await this.addVersionToExtensionState(context, this.installedVersionsId, install);
    }

    protected async addVersionToExtensionState(context : IAcquisitionWorkerContext, idStr: string, installObj: DotnetInstall, alreadyHoldingLock = false)
    {
        return this.executeWithLock( alreadyHoldingLock, idStr, async (id: string, install: DotnetInstall) =>
        {
            this.eventStream.post(new RemovingVersionFromExtensionState(`Adding ${JSON.stringify(install)} with id ${id} from the state.`));

            const existingVersions = await this.getExistingInstalls(id === this.installedVersionsId, true);
            const preExistingInstallIndex = existingVersions.findIndex(x => IsEquivalentInstallation(x.dotnetInstall, install));

            if(preExistingInstallIndex !== -1)
            {
                const existingInstall = existingVersions.find(x => IsEquivalentInstallation(x.dotnetInstall, install));

                // Did this extension already mark itself as having ownership of this install? If so, we can skip re-adding it.
                if(!(existingInstall?.installingExtensions.includes(context.acquisitionContext?.requestingExtensionId ?? null)))
                {
                    this.eventStream.post(new SkipAddingInstallEvent(`Skipped adding ${JSON.stringify(install)} to the state because it was already there with the same owner.`));
                    existingInstall!.installingExtensions.push(context.acquisitionContext?.requestingExtensionId ?? null);
                    existingVersions[preExistingInstallIndex] = existingInstall!;
                }
            }
            else
            {
                existingVersions.push(
                    {
                        dotnetInstall: install,
                        installingExtensions: [context.acquisitionContext?.requestingExtensionId ?? null ]
                    } as InstallRecord
                );
            }

            this.eventStream.post(new AddTrackingVersions(`Updated ${idStr} :
${existingVersions.map(x => `${JSON.stringify(x.dotnetInstall)} owned by ${x.installingExtensions.map(owner => owner ?? 'null').join(', ')}\n`)}`));
            await this.extensionState.update(id, existingVersions);
        }, idStr, installObj);
    }

    public async checkForUnrecordedLocalSDKSuccessfulInstall(context : IAcquisitionWorkerContext, dotnetInstallDirectory: string, installedInstallIdsList: InstallRecord[]): Promise<InstallRecord[]>
    {
        return this.executeWithLock( false, this.installedVersionsId, async (dotnetInstallDir: string, installedInstallIds: InstallRecord[]) =>
        {
            let localSDKDirectoryIdIter = '';
            try
            {
                // Determine installed version(s) of local SDKs for the EDU bundle.
                const installIds = fs.readdirSync(path.join(dotnetInstallDir, 'sdk'));

                // Update extension state
                for (const installId of installIds)
                {
                    localSDKDirectoryIdIter = installId;
                    const installRecord = GetDotnetInstallInfo(getVersionFromLegacyInstallId(installId), 'sdk', 'local', DotnetCoreAcquisitionWorker.defaultArchitecture());
                    this.eventStream.post(new DotnetPreinstallDetected(installRecord));
                    await this.addVersionToExtensionState(context, this.installedVersionsId, installRecord, true);
                    installedInstallIds.push({ dotnetInstall: installRecord, installingExtensions: [ null ] } as InstallRecord);
                }
            }
            catch (error)
            {
                this.eventStream.post(new DotnetPreinstallDetectionError(error as Error, GetDotnetInstallInfo(localSDKDirectoryIdIter, 'sdk', 'local',
                    DotnetCoreAcquisitionWorker.defaultArchitecture())));
            }
            return installedInstallIds;
        }, dotnetInstallDirectory, installedInstallIdsList);
    }
}