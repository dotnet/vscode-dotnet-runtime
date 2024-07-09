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
    DotnetAcquisitionStatusResolved,
    DotnetLockAttemptingAcquireEvent,
    DotnetLockErrorEvent,
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
    GetDotnetInstallInfo,
    InstallToStrings,
    IsEquivalentInstallation,
    IsEquivalentInstallationFile
} from './DotnetInstall';
import { getVersionFromLegacyInstallKey, getAssumedInstallInfo } from '../Utils/InstallKeyUtilities';
import { InstallRecord, InstallRecordOrStr } from './InstallRecord';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { IEventStream } from '../EventStream/EventStream';
import { IExtensionState } from '../IExtensionState';
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
    private readonly installingVersionsKey = 'installing';
    private readonly installedVersionsKey = 'installed';

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

    protected executeWithLock = async <A extends any[], R>(alreadyHoldingLock : boolean, f: (...args: A) => R, ...args: A): Promise<R> =>
    {

        const trackingLock = 'tracking.lock';
        const lockPath = path.join(__dirname, trackingLock);
        fs.writeFileSync(lockPath, '', 'utf-8');

        this.eventStream?.post(new DotnetLockAttemptingAcquireEvent(`Lock Acquisition request to begin.`, new Date().toISOString(), lockPath, lockPath));
        try
        {
            if(alreadyHoldingLock)
            {
                return await f(...(args));
            }
            const release = await lockfile.lock(lockPath, { retries: { retries: 10, minTimeout: 5, maxTimeout: 10000 } });
            try
            {
                return await f(...(args));
            }
            finally
            {
                await release();
            }
        }
        catch(e : any)
        {
            // Either the lock could not be acquired or releasing it failed
            this.eventStream.post(new DotnetLockErrorEvent(e, e?.message ?? 'Unable to acquire lock to update installation state', new Date().toISOString(), lockPath, lockPath));
            throw new EventBasedError('DotnetLockErrorEvent', e?.message, e?.stack);
        }
    }

    public async clearPromises() : Promise<void>
    {
        await this.executeWithLock( false, () => {this.inProgressInstalls.clear();});
    }

    /**
     *
     * @param key the install key to get a working install promise for.
     */
    public getPromise(key : DotnetInstall) : Promise<string> | null
    {
            this.inProgressInstalls.forEach(x =>
            {
                const xAsKey = x.dotnetInstall as DotnetInstall;
                if(IsEquivalentInstallationFile(xAsKey, key))
                {
                    this.eventStream.post(new DotnetAcquisitionStatusResolved(key, key.version));
                    return x.installingPromise;
                }
            })
            return null;
    }

    public async addPromise(installKey : DotnetInstall, installPromise : Promise<string>) : Promise<void>
    {
        return this.executeWithLock( false, (key : DotnetInstall, workingInstall : Promise<string>) =>
        {
            this.inProgressInstalls.add({ dotnetInstall: key, installingPromise: workingInstall });
        }, installKey, installPromise);
    }

    protected async removePromise(installKey : DotnetInstall) : Promise<void>
    {
        return this.executeWithLock( false, (key : DotnetInstall) =>
        {
            const resolvedInstall : InProgressInstall | undefined = [...this.inProgressInstalls].find(x => IsEquivalentInstallation(x.dotnetInstall as DotnetInstall, key));
            if(!resolvedInstall)
            {
                this.eventStream.post(new NoMatchingInstallToStopTracking(`No matching install to stop tracking for ${key.installKey}.
Installs: ${[...this.inProgressInstalls].map(x => x.dotnetInstall.installKey).join(', ')}`));
                return;
            }
            this.inProgressInstalls.delete(resolvedInstall);
        }, installKey);
    }

    public async uninstallAllRecords() : Promise<void>
    {
        return this.executeWithLock( false, async () =>
        {
            // This does not uninstall global things yet, so don't remove their keys.
            const installingVersions = await this.getExistingInstalls(false, true);
            const remainingInstallingVersions = installingVersions.filter(x => x.dotnetInstall.isGlobal);
            await this.extensionState.update(this.installingVersionsKey, remainingInstallingVersions);

            const installedVersions = await this.getExistingInstalls(true, true);
            const remainingInstalledVersions = installedVersions.filter(x => x.dotnetInstall.isGlobal);
            await this.extensionState.update(this.installedVersionsKey, remainingInstalledVersions);
        }, );
    }

    /**
     *
     * @param getAlreadyInstalledVersions - Whether to get the versions that are already installed. If true, gets installed, if false, gets what's still being installed / installing.
     */
    public async getExistingInstalls(getAlreadyInstalledVersion : boolean, alreadyHoldingLock = false) : Promise<InstallRecord[]>
    {
        return this.executeWithLock( alreadyHoldingLock, (getAlreadyInstalledVersions : boolean) =>
        {
            const extensionStateAccessor = getAlreadyInstalledVersions ? this.installedVersionsKey : this.installingVersionsKey;
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
                else
                {
                    convertedInstalls.push(install);
                }
            });

            this.extensionState.update(extensionStateAccessor, convertedInstalls);

            this.eventStream.post(new FoundTrackingVersions(`${getAlreadyInstalledVersions ? this.installedVersionsKey : this.installingVersionsKey} :
${convertedInstalls.map(x => `${JSON.stringify(x.dotnetInstall)} owned by ${x.installingExtensions.map(owner => owner ?? 'null').join(', ')}\n`)}`));
            return convertedInstalls;
        }, getAlreadyInstalledVersion);
    }


    public async reclassifyInstallingVersionToInstalled(context : IAcquisitionWorkerContext, install : DotnetInstall)
    {
        await this.untrackInstallingVersion(context, install);
        await this.trackInstalledVersion(context, install);
    }

    public async untrackInstallingVersion(context : IAcquisitionWorkerContext, install : DotnetInstall)
    {
        await this.removeVersionFromExtensionState(context, this.installingVersionsKey, install);
        this.removePromise(install);
    }

    public async untrackInstalledVersion(context : IAcquisitionWorkerContext, install : DotnetInstall)
    {
        await this.removeVersionFromExtensionState(context, this.installedVersionsKey, install);
    }

    protected async removeVersionFromExtensionState(context : IAcquisitionWorkerContext, keyStr: string, installKeyObj: DotnetInstall)
    {
        return this.executeWithLock( false, async (key: string, install: DotnetInstall) =>
        {
            this.eventStream.post(new RemovingVersionFromExtensionState(`Removing ${JSON.stringify(install)} with key ${key} from the state.`));
            const existingInstalls = await this.getExistingInstalls(key === this.installedVersionsKey, true);
            const installRecord = existingInstalls.filter(x => IsEquivalentInstallation(x.dotnetInstall, install));

            if(installRecord)
            {
                if(installRecord.length > 1)
                {
                    /* tslint:disable:prefer-template */
                    this.eventStream.post(new DuplicateInstallDetected(`The install
                        ${(install)} has a duplicated record ${installRecord.length} times in the extension state.
                        ${installRecord.map(x => x.installingExtensions.join(' ') + InstallToStrings(x.dotnetInstall)).join(' ') + '\n'}`));
                }

                const preExistingRecord = installRecord.at(0);
                const owners = preExistingRecord?.installingExtensions.filter(x => x !== context.acquisitionContext?.requestingExtensionId);
                if((owners?.length ?? 0) < 1)
                {
                    // There are no more references/extensions that depend on this install, so remove the install from the list entirely.
                    // For installing versions, there should only ever be 1 owner.
                    // For installed versions, there can be N owners.
                    this.eventStream.post(new RemovingExtensionFromList(`The last owner ${context.acquisitionContext?.requestingExtensionId} removed ${JSON.stringify(install)} entirely from the state.`));
                    await this.extensionState.update(key, existingInstalls.filter(x => !IsEquivalentInstallation(x.dotnetInstall, install)));
                }
                else
                {
                    // There are still other extensions that depend on this install, so merely remove this requesting extension from the list of owners.
                    this.eventStream.post(new RemovingOwnerFromList(`The owner ${context.acquisitionContext?.requestingExtensionId} removed ${JSON.stringify(install)} itself from the list, but ${owners?.join(', ')} remain.`));
                    await this.extensionState.update(key, existingInstalls.map(x => IsEquivalentInstallation(x.dotnetInstall, install) ?
                        { dotnetInstall: install, installingExtensions: owners } as InstallRecord : x));
                }
            }
        }, keyStr, installKeyObj);
    }

    public async trackInstallingVersion(context : IAcquisitionWorkerContext, install: DotnetInstall)
    {
        await this.addVersionToExtensionState(context, this.installingVersionsKey, install);
    }

    public async trackInstalledVersion(context : IAcquisitionWorkerContext, install: DotnetInstall)
    {
        await this.addVersionToExtensionState(context, this.installedVersionsKey, install);
    }

    protected async addVersionToExtensionState(context : IAcquisitionWorkerContext, keyStr: string, installObj: DotnetInstall, alreadyHoldingLock = false)
    {
        return this.executeWithLock( alreadyHoldingLock, async (key: string, install: DotnetInstall) =>
        {
            this.eventStream.post(new RemovingVersionFromExtensionState(`Adding ${JSON.stringify(install)} with key ${key} from the state.`));

            const existingVersions = await this.getExistingInstalls(key === this.installedVersionsKey, true);
            const preExistingInstallIndex = existingVersions.findIndex(x => IsEquivalentInstallation(x.dotnetInstall, install));

            if(preExistingInstallIndex !== -1)
            {
                const existingInstall = existingVersions.find(x => IsEquivalentInstallation(x.dotnetInstall, install));

                // Did this extension already mark itself as having ownership of this install? If so, we can skip re-adding it.
                if(!(existingInstall?.installingExtensions.includes(context.acquisitionContext?.requestingExtensionId ?? null)))
                {
                    this.eventStream.post(new SkipAddingInstallEvent(`Skipped adding ${install} to the state because it was already there with the same owner.`));
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

            this.eventStream.post(new AddTrackingVersions(`Updated ${keyStr} :
${existingVersions.map(x => `${JSON.stringify(x.dotnetInstall)} owned by ${x.installingExtensions.map(owner => owner ?? 'null').join(', ')}\n`)}`));
            await this.extensionState.update(key, existingVersions);
        }, keyStr, installObj);
    }

    public async checkForUnrecordedLocalSDKSuccessfulInstall(context : IAcquisitionWorkerContext, dotnetInstallDirectory: string, installedInstallKeysList: InstallRecord[]): Promise<InstallRecord[]>
    {
        return this.executeWithLock( false, async (dotnetInstallDir: string, installedInstallKeys: InstallRecord[]) =>
        {
            let localSDKDirectoryKeyIter = '';
            try
            {
                // Determine installed version(s) of local SDKs for the EDU bundle.
                const installKeys = fs.readdirSync(path.join(dotnetInstallDir, 'sdk'));

                // Update extension state
                for (const installKey of installKeys)
                {
                    localSDKDirectoryKeyIter = installKey;
                    const installRecord = GetDotnetInstallInfo(getVersionFromLegacyInstallKey(installKey), 'sdk', 'local', DotnetCoreAcquisitionWorker.defaultArchitecture());
                    this.eventStream.post(new DotnetPreinstallDetected(installRecord));
                    await this.addVersionToExtensionState(context, this.installedVersionsKey, installRecord, true);
                    installedInstallKeys.push({ dotnetInstall: installRecord, installingExtensions: [ null ] } as InstallRecord);
                }
            }
            catch (error)
            {
                this.eventStream.post(new DotnetPreinstallDetectionError(error as Error, GetDotnetInstallInfo(localSDKDirectoryKeyIter, 'sdk', 'local',
                    DotnetCoreAcquisitionWorker.defaultArchitecture())));
            }
            return installedInstallKeys;
        }, dotnetInstallDirectory, installedInstallKeysList);
    }
}