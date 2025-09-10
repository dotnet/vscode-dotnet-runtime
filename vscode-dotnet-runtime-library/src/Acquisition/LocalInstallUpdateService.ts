/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IEventStream } from '../EventStream/EventStream';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IExtensionState } from '../IExtensionState';
import { AcquireErrorConfiguration } from '../Utils/ErrorHandler';
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
 * Validates .NET installations by checking for the existence and validity of .NET executables or directories.
 * Provides options to either throw errors or return false on validation failure.
 */
export class LocalInstallUpdateService extends IInstallManagementService
{
    constructor(protected readonly eventStream: IEventStream, private readonly extensionState: IExtensionState, private readonly managementDirectoryProvider: IInstallationDirectoryProvider,
        private readonly installAction : () => Promise<IDotnetAcquireResult | undefined>,
        private readonly uninstallAction : (commandContext: IDotnetAcquireContext, force: boolean, onlyCheckLiveDependents: boolean) => Promise<string>
    )
    {
        super(eventStream);
    }

    public async ManageInstalls(updateCadenceMs = 300000): Promise<void>
    {
        this.checkForUpdates(updateCadenceMs).catch((e) => {});
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
            this.automaticUpdate();
        }
    }

    private async getInstallGroups(): Promise<Map<InstallGroup, InstallRecord[]>>
    {
        const runtimeInstalls = await InstallTrackerSingleton.getInstance(this.eventStream, this.extensionState).getExistingInstalls(this.managementDirectoryProvider, false);
        const installGroupsToInstalls: Map<InstallGroup, InstallRecord[]> = new Map();

        for (const install of runtimeInstalls)
        {
            const majorMinor = versionUtils.getMajorMinorFromValidVersion(install.dotnetInstall.version, this.eventStream);
            const architecture = install.dotnetInstall.architecture || DotnetCoreAcquisitionWorker.defaultArchitecture();
            const mode = install.dotnetInstall.installMode;

            if (majorMinor !== '0.0')
            {
                const key = { mode, architecture, majorMinor } as InstallGroup;
                if (!installGroupsToInstalls.has(key))
                {
                    installGroupsToInstalls.set(key, [install]);
                }
                else
                {
                    installGroupsToInstalls.get(key)!.push(install);
                }
            }
        }

        return installGroupsToInstalls;
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
        // Get install groups.
        const installGroups = await this.getInstallGroups();
        for (const group of installGroups.keys())
        {
            // Call Acquire
            const acquireContext: IDotnetAcquireContext = {
                version: group.majorMinor,
                architecture: group.architecture,
                mode: group.mode,
                installType: 'local',
                requestingExtensionId: 'dotnet-runtime-library',
                errorConfiguration: AcquireErrorConfiguration.DisableErrorPopups // todo : make this quiet as well ?
            }
            // TODO : Call acquire with the above context and get the latest install.
            // Get latest version
            const latestInstall = '';

            // Mark Owners.
            const owners = this.getAllNonUserOwnersOfCollection(installGroups.get(group)!);
            InstallTrackerSingleton.getInstance(this.eventStream, this.extensionState).addOwners(latestInstall, owners, this.managementDirectoryProvider);

            // Uninstall all in the group that are not live dependents and not the latest one (which should also be live but no need to check)
            const installsInGroup = installGroups.get(group)!;
            installsInGroup.filter(i => i.dotnetInstall.version !== latestInstall.dotnetInstall.version);

            for (const install of installsInGroup)
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
        }
    }
}
