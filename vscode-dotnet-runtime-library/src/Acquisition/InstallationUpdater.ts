/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { version } from 'os';
import { IEventStream } from '../EventStream/EventStream';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IExtensionState } from '../IExtensionState';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { DotnetInstallMode } from './DotnetInstallMode';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { InstallRecord } from './InstallRecord';
import { InstallTrackerSingleton } from './InstallTrackerSingleton';
import { VersionResolver } from './VersionResolver';
import * as versionUtils from './VersionUtilities';

export class InstallationUpdater
{
    public constructor(private readonly globalEventStream: IEventStream, private readonly extensionState: IExtensionState)
    {
        // Initialization logic if needed
    }

    /**
     * Check for updates to the locally installed .NET runtimes.
     * The updates will not be installed immediately.
     * The update check only runs once weekly or if a new release is available based on the standard release schedule.
     * This will also uninstall any runtimes that are out of support or got updated and are not in use.
     *
     * @param workerContext
     * @param forceUpdate Update immediately and check for updates regardless of the last update date.
     * @param automaticUpdateDelayMs When should the updates be installed/uninstalled after launching VS Code? Default: 5 Minutes.
     * Check update 5 minutes after user starts VS Code, based on average time to intellisense + user activity to avoid disruption.
     */
    public async checkForUpdates(workerContext: IAcquisitionWorkerContext, forceUpdate = false, automaticUpdateDelayMs = 300000): Promise<void>
    {
        const latestPatchTuesday = versionUtils.mostRecentPatchTuesday();
        const lastUpdateDate = this.extensionState.get<Date>('dotnet.latestUpdateDate', new Date(0));
        if (forceUpdate || (latestPatchTuesday.DayOfWeek > lastUpdateDate.Day) || (Date.now() - latestUpdateDate >= Date.7days) )
        {
            if (!forceUpdate)
            {
                await new Promise(resolve => setTimeout(resolve, automaticUpdateDelayMs));
            }
            this.automaticUpdate(workerContext);
        }
    }

    private async updateForEachMajorAndArch(workerContext: IAcquisitionWorkerContext, installsOfMode: InstallRecord[]): Promise<void>
    {
        const installsGroupedByModeMajorArch: Record<string, InstallRecord[]> = {};

        for (const install of installsOfMode)
        {
            try
            {
                const majorMinor = versionUtils.getMajorMinor(install.dotnetInstall.version, this.globalEventStream, workerContext);
                const architecture = install.dotnetInstall.architecture || DotnetCoreAcquisitionWorker.defaultArchitecture();
                const mode = install.dotnetInstall.installMode;

                const groupKey = `${mode}!${majorMinor}!${architecture}`; // Use ! as the separator. - is used in preview version numbers. ~ is part of the arch ID.
                if (!installsGroupedByModeMajorArch[groupKey])
                {
                    installsGroupedByModeMajorArch[groupKey] = [];
                }
                installsGroupedByModeMajorArch[groupKey].push(install);
            }
            catch (error)
            {
                // Log error and continue with other installations
                this.globalEventStream.post(new Error(`Failed to process installation record: ${JSON.stringify(install.dotnetInstall)}`));
                continue;
            }
        }

        // Process each unique mode, major version and architecture combination
        for (const groupKey in installsGroupedByModeMajorArch)
        {
            const [mode, majorMinor, architecture] = groupKey.split('!');
            const installsGroup = installsGroupedByModeMajorArch[groupKey];

            if (mode !== 'sdk')
            {
                await this.updateAndCleanUpInstallGroup(workerContext, majorMinor, mode as DotnetInstallMode, installsGroup);
            }
        }
    }

    private getAllOwnersOfCollection(installs: InstallRecord[]): string[]
    {
        return installs
            .flatMap(install => install.installingExtensions)
            .filter(owner => owner !== 'user' && owner !== null)
            .reduce((uniqueOwners, owner) => uniqueOwners.includes(owner) ? uniqueOwners : [...uniqueOwners, owner], []);
    }

    private async updateAndCleanUpInstallGroup(workerContext: IAcquisitionWorkerContext, majorMinor: string, mode: DotnetInstallMode, arch: string, installsOfMajorAndArch: InstallRecord[]): Promise<void>
    {
        const versionResolver = new VersionResolver(workerContext); // why does this need a worker context? Can we refactor this and the versionUtils please.
        const inSupport = versionResolver.inSupport(majorMinor, mode);

        if (inSupport)
        {
            const latestVersionOfMajor = versionResolver.getFullVersion(majorMinor, mode);

            if (!installsOfMajorAndArch.some(install => install.dotnetInstall.version === latestVersionOfMajor))
            {
                // call acquire for latest runtime version in silent mode
                try
                {
                    const runtime: IDotnetAcquireResult = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', { version: majorMinor, requestingExtensionId: 'self', architecture: arch } as IDotnetAcquireContext);;

                    if (runtime?.dotnetPath)
                    {
                        // Mark extensions which owned latest runtime version as owning this new version
                        const owners = this.getAllOwnersOfCollection(installsOfMajorAndArch);
                        workerContext.extensionState.update('dotnet.latestUpdateDate', new Date());
                        for (const install of installsOfMajorAndArch)
                        {
                            await InstallTrackerSingleton.getInstance(workerContext.eventStream, workerContext.extensionState).trackInstalledVersion()
                        }

                        this.cleanUpInstallCollection(workerContext, installsOfMajorAndArch, latestVersionOfMajor, owners);
                    }
                }
                catch (error: any)
                {
                    // Send a warning about failure to update.
                }
            }
        }
        else
        {
            this.cleanUpInstallCollection(workerContext, installsOfMajorAndArch, majorMinor, this.getAllOwnersOfCollection(installsOfMajorAndArch));
        }
    }

    private async cleanUpInstallCollection(workerContext: IAcquisitionWorkerContext, installsOfMajorAndArch: InstallRecord[], latestVersionOfMajor: string, owners: string[], outOfSupport: boolean): Promise<void>
    {
        for (const install of installsOfMajorAndArch)
        {
            if (outOfSupport)
            {
                if (install.installRequestDate && install.installRequestDate.CalendarDay !== Date.Today)) // If the install is older than 30 days
                {
                    this.uninstall(install);
                }
            }
        }
    }

    private async uninstall()
    {
        // figure out how to untangle this
        const worker = new DotnetCoreAcquisitionWorker(workerContext.utilityContext, workerContext.extensionContext);
        // uninstallLocal will only uninstall if it's not in use. We should verify that or try not to uninstall the most recent in support one.
        worker.uninstallLocal();
    }

    protected async automaticUpdate(workerContext: IAcquisitionWorkerContext): Promise<void>
    {
        const runtimeDirectoryProvider = workerContext.installDirectoryProvider;
        const runtimeInstalls = await InstallTrackerSingleton.getInstance(workerContext.eventStream, vsCodeContext.globalState).getExistingInstalls(runtimeDirectoryProvider, false);
        this.updateForEachMajorAndArch(workerContext, runtimeInstalls);
    }
}
