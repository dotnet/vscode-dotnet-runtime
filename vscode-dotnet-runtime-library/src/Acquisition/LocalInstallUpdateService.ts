/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IEventStream } from '../EventStream/EventStream';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IExtensionState } from '../IExtensionState';
import { AcquireErrorConfiguration } from '../Utils/ErrorHandler';
import { WebRequestWorkerSingleton } from '../Utils/WebRequestWorkerSingleton';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { DotnetInstallMode } from './DotnetInstallMode';
import { IInstallationDirectoryProvider } from './IInstallationDirectoryProvider';
import { IInstallManagementService } from './IInstallManagementService';
import { InstallRecord } from './InstallRecord';
import { InstallTrackerSingleton } from './InstallTrackerSingleton';

import * as versionUtils from './VersionUtilities';

export interface InstallGroup
{
    mode: DotnetInstallMode;
    architecture: string | null;
    majorMinor: string;
}

/**
 * Manages local installs of .NET, by installing, uninstalling, and updating them sometime after vscode is launched.
 */
export class LocalInstallUpdateService extends IInstallManagementService
{
    constructor(protected readonly eventStream: IEventStream, private readonly extensionState: IExtensionState, private readonly managementDirectoryProvider: IInstallationDirectoryProvider,
        private readonly installAction: (commandContext: IDotnetAcquireContext, ignorePathSetting: boolean) => Promise<IDotnetAcquireResult | undefined>,
        private readonly uninstallAction: (commandContext: IDotnetAcquireContext, force: boolean, onlyCheckLiveDependents: boolean) => Promise<string>,
        private readonly installTrackerType: typeof InstallTrackerSingleton = InstallTrackerSingleton
    )
    {
        super(eventStream);
    }

    public ManageInstalls(updateCadenceMs = 300000): Promise<void>
    {
        return this.checkForUpdates(updateCadenceMs);
    }

    /**
     * Check for updates to the locally installed .NET runtimes.
     * The updates will not be installed immediately.
     * This will also uninstall any runtimes that are out of support or got updated and are not in use.
     *
     * @param workerContext
     * @param automaticUpdateDelayMs When should the updates be installed/uninstalled after launching VS Code? Default: 5 Minutes.
     * Check update 5 minutes after user starts VS Code, based on average time to intellisense + user activity to avoid disruption.
     */
    private async checkForUpdates(automaticUpdateDelayMs = 300000): Promise<void>
    {
        const lastUpdateDate = this.extensionState.get<Date>('dotnet.latestUpdateDate', new Date(0));
        // Check if at least 1 day (24 hours) has passed since last update per SDL
        const oneDayMs = 24 * 60 * 60 * 1000;
        if ((Date.now() - new Date(lastUpdateDate).getTime()) >= oneDayMs)
        {
            await new Promise(resolve => setTimeout(resolve, automaticUpdateDelayMs));
            return this.automaticUpdate();
        }
    }

    private async getInstallGroups(): Promise<Map<InstallGroup, InstallRecord[]>>
    {
        const runtimeInstalls = await this.installTrackerType.getInstance(this.eventStream, this.extensionState).getExistingInstalls(this.managementDirectoryProvider, false);
        const installGroupsToInstalls = new Map<string, { key: InstallGroup; installs: InstallRecord[] }>();

        for (const install of runtimeInstalls)
        {
            const majorMinor = versionUtils.getMajorMinorFromValidVersion(install.dotnetInstall.version);
            const architecture = install.dotnetInstall.architecture || DotnetCoreAcquisitionWorker.defaultArchitecture();
            const mode = install.dotnetInstall.installMode;

            if (majorMinor !== '0.0')
            {
                const mapKey = `${mode}|${architecture}|${majorMinor}`;
                if (!installGroupsToInstalls.has(mapKey))
                {
                    installGroupsToInstalls.set(mapKey, { key: { mode, architecture, majorMinor }, installs: [install] });
                }
                else
                {
                    installGroupsToInstalls.get(mapKey)!.installs.push(install);
                }
            }
        }

        return new Map(Array.from(installGroupsToInstalls.values()).map(groupInfo => [groupInfo.key, groupInfo.installs] as [InstallGroup, InstallRecord[]]));
    }

    private getAllNonUserOwnersOfCollection(installs: InstallRecord[]): string[]
    {
        const ownerSet = new Set<string>();
        for (const install of installs)
        {
            for (const owner of install.installingExtensions)
            {
                if (owner && owner !== 'user')
                {
                    ownerSet.add(owner);
                }
            }
        }
        return Array.from(ownerSet);
    }

    private async automaticUpdate(): Promise<void>
    {
        const isOffline = !(await WebRequestWorkerSingleton.getInstance().isOnline(500, this.eventStream));
        if (isOffline)
        {
            // TODO: Add warning about failure to update ?
            return Promise.resolve();
        }

        const installGroupEntries = Array.from((await this.getInstallGroups()).entries());
        let processedGroup = false;
        for (const [group, installsInGroup] of installGroupEntries)
        {
            const acquireContext: IDotnetAcquireContext = {
                version: group.majorMinor,
                architecture: group.architecture,
                mode: group.mode,
                installType: 'local',
                requestingExtensionId: 'dotnet-runtime-library',
                errorConfiguration: AcquireErrorConfiguration.DisableErrorPopups, // todo : make this quiet as well ?
                forceUpdate: true
            }

            // Make sure latest version is acquired (aka update - this defers download of the release manifest away from initialization)
            await this.installAction(acquireContext, true);
            // If acquire fails, then the update will throw - we don't want to uninstall if we don't have a newer version to use next time.

            // Get latest install - the install returned by acquire may still be a user managed path (not owned by us) if we're offline.
            const tracker = this.installTrackerType.getInstance(this.eventStream, this.extensionState);
            const extensionManagedInstalls = await tracker.getExistingInstalls(this.managementDirectoryProvider, false);
            const newInstallsInGroup = extensionManagedInstalls.filter(i => i.dotnetInstall.installMode === group.mode &&
                (i.dotnetInstall.architecture || DotnetCoreAcquisitionWorker.defaultArchitecture()) === group.architecture &&
                versionUtils.getMajorMinorFromValidVersion(i.dotnetInstall.version) === group.majorMinor);

            // All of the installs were uninstalled in the middle of this process.
            if (newInstallsInGroup.length === 0)
            {
                continue;
            }

            // Sort installations by version (patch/feature band since major.minor is all the same) and find the one with the highest version
            let latestInstall = newInstallsInGroup[0];
            if (newInstallsInGroup.length > 1)
            {
                for (const install of newInstallsInGroup)
                {
                    const currentPatch = Number(versionUtils.getFeatureBandOrPatchFromFullySpecifiedVersion(install.dotnetInstall.version));
                    const latestPatch = Number(versionUtils.getFeatureBandOrPatchFromFullySpecifiedVersion(latestInstall.dotnetInstall.version));
                    if (currentPatch > latestPatch)
                    {
                        latestInstall = install;
                    }
                }
            }

            // Make it so all owners of all installs the group own the latest version - owning basically means they depend on it / requested it (now in the past for a different version)
            const owners = this.getAllNonUserOwnersOfCollection(installsInGroup);
            await tracker.addOwners(latestInstall.dotnetInstall, owners, this.managementDirectoryProvider);

            // Uninstall all in the group that are not live dependents and not the latest one (which should also be live but no need to check)
            const outdatedInstalls = installsInGroup.filter(i => i.dotnetInstall.version !== latestInstall.dotnetInstall.version);

            for (const install of outdatedInstalls)
            {
                const uninstallContext: IDotnetAcquireContext = {
                    version: install.dotnetInstall.version,
                    architecture: install.dotnetInstall.architecture,
                    mode: install.dotnetInstall.installMode,
                    requestingExtensionId: 'dotnet-runtime-library',
                    installType: 'local',
                    errorConfiguration: AcquireErrorConfiguration.DisableErrorPopups
                };

                this.uninstallAction(uninstallContext, false, true).catch((e: any) => {});
            }

            processedGroup = true;
        }
        if (processedGroup)
        {
            await this.extensionState.update('dotnet.latestUpdateDate', new Date(0));
        }
        return Promise.resolve();
    }
}
