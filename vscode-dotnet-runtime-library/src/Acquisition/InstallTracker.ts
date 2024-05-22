/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as lockfile from 'proper-lockfile';
import * as path from 'path';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import {
    DotnetAcquisitionStatusResolved,
    DotnetLockAttemptingAcquireEvent,
    DotnetLockErrorEvent,
    DotnetPreinstallDetected,
    DotnetPreinstallDetectionError,
    DuplicateInstallDetected,
    NoMatchingInstallToStopTracking
} from '../EventStream/EventStreamEvents';
import {
    DotnetInstall,
    GetDotnetInstallInfo,
    InstallToStrings,
    IsEquivalentInstallation,
    IsEquivalentInstallationFile
} from './DotnetInstall';
import { getVersionFromLegacyInstallKey, installKeyStringToDotnetInstall } from '../Utils/InstallKeyUtilities';
import { InstallRecord, InstallRecordOrStr } from './InstallRecord';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { error } from 'console';
/* tslint:disable:no-any */


interface InProgressInstall
{
    dotnetInstall: DotnetInstall;
    // The string is the path of the install once completed.
    installingPromise: Promise<string>;
}


export class InstallTracker
{
    protected inProgressInstalls: Set<InProgressInstall> = new Set<InProgressInstall>();
    private readonly installingVersionsKey = 'installing';
    private readonly installedVersionsKey = 'installed';

    public constructor(protected readonly context : IAcquisitionWorkerContext)
    {

    }

    protected executeWithLock = async <A extends any[], R>(alreadyHoldingLock : boolean, f: (...args: A) => R, ...args: A): Promise<R> =>
    {

        const trackingLock = 'tracking.lock';
        const lockPath = path.join(__dirname, trackingLock);
        fs.writeFileSync(lockPath, '', 'utf-8');

        this.context.eventStream?.post(new DotnetLockAttemptingAcquireEvent(`Lock Acquisition request to begin.`, new Date().toISOString(), lockPath, lockPath));
        try
        {
            if(alreadyHoldingLock)
            {
                return await f(...(args));
            }
            const release = await lockfile.lock(lockPath, { retries: { retries: 10, maxTimeout: 1000 } });
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
            this.context.eventStream.post(new DotnetLockErrorEvent(e, e?.message ?? 'Unable to acquire lock to update installation state', new Date().toISOString(), lockPath, lockPath));
            throw error();
        }
    }

    public async clearPromises() : Promise<void>
    {
        await this.executeWithLock( false, () => {this.inProgressInstalls.clear();});
    }

    /**
     *
     * @param key the install key to get a working install promise for.
     * @remarks THROWS ERROR if no promise is found (because we cant await a promise of a promise and get a promise object back.)
     */
    public getPromise(key : DotnetInstall) : Promise<string> | null
    {
            this.inProgressInstalls.forEach(x =>
            {
                const xAsKey = x.dotnetInstall as DotnetInstall;
                if(IsEquivalentInstallationFile(xAsKey, key))
                {
                    this.context.eventStream.post(new DotnetAcquisitionStatusResolved(key, key.version));
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
                this.context.eventStream.post(new NoMatchingInstallToStopTracking(`No matching install to stop tracking for ${key.installKey}.
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
            await this.context.extensionState.update(this.installingVersionsKey, remainingInstallingVersions);

            const installedVersions = await this.getExistingInstalls(true, true);
            const remainingInstalledVersions = installedVersions.filter(x => x.dotnetInstall.isGlobal);
            await this.context.extensionState.update(this.installedVersionsKey, remainingInstalledVersions);
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
            const existingInstalls = this.context.extensionState.get<InstallRecordOrStr[]>(extensionStateAccessor, []);
            const convertedInstalls : InstallRecord[] = [];

            existingInstalls.forEach((install: InstallRecordOrStr) =>
            {
                if(typeof install === 'string')
                {
                    convertedInstalls.push(
                        {
                            dotnetInstall: installKeyStringToDotnetInstall(this.context, install),
                            installingExtensions: [ null ],
                        } as InstallRecord
                    );
                }
                else
                {
                    convertedInstalls.push(install);
                }
            });

            this.context.extensionState.update(extensionStateAccessor, convertedInstalls);
            return convertedInstalls;
        }, getAlreadyInstalledVersion);
    }


    public async reclassifyInstallingVersionToInstalled(install : DotnetInstall)
    {
        await this.untrackInstallingVersion(install);
        await this.trackInstalledVersion(install);
    }

    public async untrackInstallingVersion(install : DotnetInstall)
    {
        await this.removeVersionFromExtensionState(this.installingVersionsKey, install);
        this.removePromise(install);
    }

    public async untrackInstalledVersion(install : DotnetInstall)
    {
        await this.removeVersionFromExtensionState(this.installedVersionsKey, install);
    }

    protected async removeVersionFromExtensionState(keyStr: string, installKeyObj: DotnetInstall)
    {
        return this.executeWithLock( false, async (key: string, installKey: DotnetInstall) =>
        {
            const existingInstalls = await this.getExistingInstalls(key === this.installedVersionsKey, true);
            const installRecord = existingInstalls.filter(x => IsEquivalentInstallation(x.dotnetInstall, installKey));

            if(installRecord)
            {
                if(installRecord.length > 1)
                {
                    /* tslint:disable:prefer-template */
                    this.context.eventStream.post(new DuplicateInstallDetected(`The install
                        ${(installKey)} has a duplicated record ${installRecord.length} times in the extension state.
                        ${installRecord.map(x => x.installingExtensions.join(' ') + InstallToStrings(x.dotnetInstall)).join(' ') + '\n'}`));
                }

                const preExistingRecord = installRecord.at(0);
                const owners = preExistingRecord?.installingExtensions.filter(x => x !== this.context.acquisitionContext?.requestingExtensionId);
                if((owners?.length ?? 0) < 1)
                {
                    // There are no more references/extensions that depend on this install, so remove the install from the list entirely.
                    // For installing versions, there should only ever be 1 owner.
                    // For installed versions, there can be N owners.
                    await this.context.extensionState.update(key, existingInstalls.filter(x => !IsEquivalentInstallation(x.dotnetInstall, installKey)));
                }
                else
                {
                    // There are still other extensions that depend on this install, so merely remove this requesting extension from the list of owners.
                    await this.context.extensionState.update(key, existingInstalls.map(x => IsEquivalentInstallation(x.dotnetInstall, installKey) ?
                        { dotnetInstall: installKey, installingExtensions: owners } as InstallRecord : x));
                }
            }
        }, keyStr, installKeyObj);
    }

    public async trackInstallingVersion(install: DotnetInstall)
    {
        await this.addVersionToExtensionState(this.installingVersionsKey, install);
    }

    public async trackInstalledVersion(install: DotnetInstall)
    {
        await this.addVersionToExtensionState(this.installedVersionsKey, install);
    }

    protected async addVersionToExtensionState(keyStr: string, installObj: DotnetInstall, alreadyHoldingLock = false)
    {
        return this.executeWithLock( alreadyHoldingLock, async (key: string, install: DotnetInstall) =>
        {
            const existingVersions = await this.getExistingInstalls(key === this.installedVersionsKey, true);
            const preExistingInstallIndex = existingVersions.findIndex(x => IsEquivalentInstallation(x.dotnetInstall, install));

            if(preExistingInstallIndex !== -1)
            {
                const existingInstall = existingVersions.find(x => IsEquivalentInstallation(x.dotnetInstall, install));

                // Did this extension already mark itself as having ownership of this install? If so, we can skip re-adding it.
                if(!(existingInstall?.installingExtensions.includes(this.context.acquisitionContext?.requestingExtensionId ?? null)))
                {
                    existingInstall!.installingExtensions.push(this.context.acquisitionContext?.requestingExtensionId ?? null);
                    existingVersions[preExistingInstallIndex] = existingInstall!;
                }
            }
            else
            {
                existingVersions.push(
                    {
                        dotnetInstall: install,
                        installingExtensions: [ this.context.acquisitionContext?.requestingExtensionId ?? null ]
                    } as InstallRecord
                );
            }

            await this.context.extensionState.update(key, existingVersions);
        }, keyStr, installObj);
    }

    public async checkForUnrecordedLocalSDKSuccessfulInstall(dotnetInstallDirectory: string, installedInstallKeysList: InstallRecord[]): Promise<InstallRecord[]>
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
                    const installRecord = GetDotnetInstallInfo(getVersionFromLegacyInstallKey(installKey), 'sdk', false, DotnetCoreAcquisitionWorker.defaultArchitecture());
                    this.context.eventStream.post(new DotnetPreinstallDetected(installRecord));
                    await this.addVersionToExtensionState(this.installedVersionsKey, installRecord, true);
                    installedInstallKeys.push({ dotnetInstall: installRecord, installingExtensions: [ null ] } as InstallRecord);
                }
            }
            catch (error)
            {
                this.context.eventStream.post(new DotnetPreinstallDetectionError(error as Error, GetDotnetInstallInfo(localSDKDirectoryKeyIter, 'sdk', false,
                    DotnetCoreAcquisitionWorker.defaultArchitecture())));
            }
            return installedInstallKeys;
        }, dotnetInstallDirectory, installedInstallKeysList);
    }
}