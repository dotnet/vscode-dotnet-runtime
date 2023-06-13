/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');
import * as proc from 'child_process';
import * as https from 'https';

import {
    DotnetAcquisitionAlreadyInstalled,
    DotnetAcquisitionCompleted,
    DotnetAcquisitionDeletion,
    DotnetAcquisitionInProgress,
    DotnetAcquisitionPartialInstallation,
    DotnetAcquisitionStarted,
    DotnetAcquisitionStatusResolved,
    DotnetAcquisitionStatusUndefined,
    DotnetPreinstallDetected,
    DotnetPreinstallDetectionError,
    DotnetUninstallAllCompleted,
    DotnetUninstallAllStarted,
} from '../EventStream/EventStreamEvents';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetCoreAcquisitionWorker } from './IDotnetCoreAcquisitionWorker';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { GlobalSDKInstallerResolver } from './GlobalSDKInstallerResolver';
import { WinMacSDKInstaller } from './WinMacSDKInstaller';
import { ISDKInstaller } from './ISDKInstaller';
import { LinuxSDKInstaller } from './LinuxSDKInstaller';

export class DotnetCoreAcquisitionWorker implements IDotnetCoreAcquisitionWorker {
    private readonly installingVersionsKey = 'installing';
    private readonly installedVersionsKey = 'installed';
    private readonly dotnetExecutable: string;
    private readonly timeoutValue: number;

    private acquisitionPromises: { [version: string]: Promise<string> | undefined };

    constructor(private readonly context: IAcquisitionWorkerContext) {
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.timeoutValue = context.timeoutValue;
        this.acquisitionPromises = {};
    }

    public async uninstallAll() {
        this.context.eventStream.post(new DotnetUninstallAllStarted());

        this.acquisitionPromises = {};

        this.removeFolderRecursively(this.context.installDirectoryProvider.getStoragePath());

        await this.context.extensionState.update(this.installingVersionsKey, []);
        await this.context.extensionState.update(this.installedVersionsKey, []);

        this.context.eventStream.post(new DotnetUninstallAllCompleted());
    }

    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    public async acquireSDK(version: string): Promise<IDotnetAcquireResult> {
        return this.acquire(version, false);
    }

    public async acquireGlobalSDK(installerResolver: GlobalSDKInstallerResolver): Promise<IDotnetAcquireResult>
    {
        return this.acquire(await installerResolver.getFullVersion(), false, installerResolver);
    }

    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    public async acquireRuntime(version: string): Promise<IDotnetAcquireResult> {
        return this.acquire(version, true);
    }

    public async acquireStatus(version: string, installRuntime: boolean): Promise<IDotnetAcquireResult | undefined> {
        const existingAcquisitionPromise = this.acquisitionPromises[version];
        if (existingAcquisitionPromise) {
            // Requested version is being acquired
            this.context.eventStream.post(new DotnetAcquisitionStatusResolved(version));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        }

        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(version);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);
        let installedVersions = this.context.extensionState.get<string[]>(this.installedVersionsKey, []);

        if (installedVersions.length === 0 && fs.existsSync(dotnetPath) && !installRuntime)
        {
            // The education bundle already laid down a local install, add it to our managed installs
            installedVersions = await this.managePreinstalledVersion(dotnetInstallDir, installedVersions);
        }

        if (installedVersions.includes(version) && fs.existsSync(dotnetPath))
        {
            // Requested version has already been installed.
            this.context.eventStream.post(new DotnetAcquisitionStatusResolved(version));
            return { dotnetPath };
        }

        // Version is not installed
        this.context.eventStream.post(new DotnetAcquisitionStatusUndefined(version));
        return undefined;
    }

    /**
     *
     * @param version the version to get of the runtime or sdk.
     * @param installRuntime true for runtime acquisition, false for SDK.
     * @param global false for local install, true for global SDK installs.
     * @returns the dotnet acqusition result.
     */
    private async acquire(version: string, installRuntime: boolean, globalInstallerResolver : GlobalSDKInstallerResolver | null = null): Promise<IDotnetAcquireResult> {
        const existingAcquisitionPromise = this.acquisitionPromises[version];
        if (existingAcquisitionPromise)
        {
            // This version of dotnet is already being acquired. Memoize the promise.
            this.context.eventStream.post(new DotnetAcquisitionInProgress(version));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        }
        else
        {
            // We're the only one acquiring this version of dotnet, start the acquisition process.
            let acquisitionPromise = null;
            if(globalInstallerResolver !== null)
            {
                // We are requesting a global sdk install.
                acquisitionPromise = this.acquireGlobalCore(globalInstallerResolver).catch((error: Error) => {
                    delete this.acquisitionPromises[version];
                    throw new Error(`.NET Acquisition Failed: ${error.message}`);
                });
            }
            else
            {
                acquisitionPromise = this.acquireCore(version, installRuntime).catch((error: Error) => {
                    delete this.acquisitionPromises[version];
                    throw new Error(`.NET Acquisition Failed: ${error.message}`);
                });
            }

            this.acquisitionPromises[version] = acquisitionPromise;
            return acquisitionPromise.then((res) => ({ dotnetPath: res }));
        }
    }

    /**
     *
     * @param version The version of the object to acquire.
     * @param installRuntime true if the request is to install the runtime, false for the SDK.
     * @param global false if we're doing a local install, true if we're doing a global install. Only supported for the SDK atm.
     * @returns the dotnet path of the acquired dotnet.
     *
     * @remarks it is called "core" because it is the meat of the actual acquisition work; this has nothing to do with .NET core vs framework.
     */
    private async acquireCore(version: string, installRuntime: boolean): Promise<string> {
        const installingVersions = this.context.extensionState.get<string[]>(this.installingVersionsKey, []);
        let installedVersions = this.context.extensionState.get<string[]>(this.installedVersionsKey, []);
        const partialInstall = installingVersions.indexOf(version) >= 0;
        if (partialInstall && installRuntime) {
            // Partial install, we never updated our extension to no longer be 'installing'.
            // uninstall everything and then re-install.
            this.context.eventStream.post(new DotnetAcquisitionPartialInstallation(version));

            await this.uninstallRuntime(version);
        } else if (partialInstall) {
            this.context.eventStream.post(new DotnetAcquisitionPartialInstallation(version));
            await this.uninstallAll();
        }

        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(version);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);

        if (fs.existsSync(dotnetPath) && installedVersions.length === 0) {
            // The education bundle already laid down a local install, add it to our managed installs
            installedVersions = await this.managePreinstalledVersion(dotnetInstallDir, installedVersions);
        }

        if (installedVersions.includes(version) && fs.existsSync(dotnetPath)) {
            // Version requested has already been installed.
            this.context.installationValidator.validateDotnetInstall(version, dotnetPath);
            this.context.eventStream.post(new DotnetAcquisitionAlreadyInstalled(version));
            return dotnetPath;
        }

        // We update the extension state to indicate we're starting a .NET Core installation.
        await this.addVersionToExtensionState(this.installingVersionsKey, version);

        const installContext = {
            installDir: dotnetInstallDir,
            version,
            dotnetPath,
            timeoutValue: this.timeoutValue,
            installRuntime,
        } as IDotnetInstallationContext;
        this.context.eventStream.post(new DotnetAcquisitionStarted(version));
        await this.context.acquisitionInvoker.installDotnet(installContext).catch((reason) => {
            throw Error(`Installation failed: ${reason}`);
        });
        this.context.installationValidator.validateDotnetInstall(version, dotnetPath);

        await this.removeVersionFromExtensionState(this.installingVersionsKey, version);
        await this.addVersionToExtensionState(this.installedVersionsKey, version);

        return dotnetPath;
    }

    private async acquireGlobalCore(globalInstallerResolver : GlobalSDKInstallerResolver): Promise<string>
    {
        const conflictingVersion = await globalInstallerResolver.GlobalInstallWithConflictingVersionAlreadyExists()
        if (conflictingVersion !== '')
        {
            throw Error(`An global install is already on the machine with a version that conflicts with the requested version.`)
        }

        // TODO check if theres a partial install from the extension if that can happen
        // TODO fix registry check
        // TODO report installer OK if conflicting exists

        const installingVersion = await globalInstallerResolver.getFullVersion();
        let installer : ISDKInstaller = os.platform() === 'linux' ? new LinuxSDKInstaller(installingVersion) : new WinMacSDKInstaller(await globalInstallerResolver.getInstallerUrl());


        // Indicate that we're beginning to do the install.
        await this.addVersionToExtensionState(this.installingVersionsKey, installingVersion);
        this.context.eventStream.post(new DotnetAcquisitionStarted(installingVersion));

        const installerResult = await installer.installSDK();
        if(installerResult !== '0')
        {
            // TODO handle this.
        }

        const installedSDKPath : string = await installer.getExpectedGlobalSDKPath(await globalInstallerResolver.getFullVersion(), os.arch());

        this.context.installationValidator.validateDotnetInstall(installingVersion, installedSDKPath);

        this.context.eventStream.post(new DotnetAcquisitionCompleted(installingVersion, installedSDKPath));

        // Remove the indication that we're installing and replace it notifying of the real installation completion.
        await this.removeVersionFromExtensionState(this.installingVersionsKey, installingVersion);
        await this.addVersionToExtensionState(this.installedVersionsKey, installingVersion);

        return installedSDKPath;
    }

    private async uninstallRuntime(version: string) {
        delete this.acquisitionPromises[version];

        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(version);
        this.removeFolderRecursively(dotnetInstallDir);

        await this.removeVersionFromExtensionState(this.installedVersionsKey, version);
        await this.removeVersionFromExtensionState(this.installingVersionsKey, version);
    }

    private async removeVersionFromExtensionState(key: string, version: string) {
        const state = this.context.extensionState.get<string[]>(key, []);
        const versionIndex = state.indexOf(version);
        if (versionIndex >= 0) {
            state.splice(versionIndex, 1);
            await this.context.extensionState.update(key, state);
        }
    }

    private async addVersionToExtensionState(key: string, version: string) {
        const state = this.context.extensionState.get<string[]>(key, []);
        state.push(version);
        await this.context.extensionState.update(key, state);
    }

    private removeFolderRecursively(folderPath: string) {
        this.context.eventStream.post(new DotnetAcquisitionDeletion(folderPath));
        rimraf.sync(folderPath);
    }

    private async managePreinstalledVersion(dotnetInstallDir: string, installedVersions: string[]): Promise<string[]> {
        try {
            // Determine installed version(s)
            const versions = fs.readdirSync(path.join(dotnetInstallDir, 'sdk'));

            // Update extension state
            for (const version of versions) {
                this.context.eventStream.post(new DotnetPreinstallDetected(version));
                await this.addVersionToExtensionState(this.installedVersionsKey, version);
                installedVersions.push(version);
            }
        } catch (error) {
            this.context.eventStream.post(new DotnetPreinstallDetectionError(error as Error));
        }
        return installedVersions;
    }


}

