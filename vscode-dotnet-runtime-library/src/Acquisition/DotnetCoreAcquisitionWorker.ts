/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');
import {
    DotnetAcquisitionAlreadyInstalled,
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
import { IDotnetAcquireContext } from '..';

export class DotnetCoreAcquisitionWorker implements IDotnetCoreAcquisitionWorker {
    private readonly installingVersionsKey = 'installing';
    private readonly installedVersionsKey = 'installed';
    public installingArchitecture : string | null;
    private readonly dotnetExecutable: string;
    private readonly timeoutValue: number;

    private acquisitionPromises: { [version: string]: Promise<string> | undefined };

    constructor(private readonly context: IAcquisitionWorkerContext) {
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.timeoutValue = context.timeoutValue;
        this.acquisitionPromises = {};
        // null deliberately allowed to use old behavior below
        this.installingArchitecture = this.context.installingArchitecture === undefined ? os.arch() : this.context.installingArchitecture;
    }

    public async uninstallAll() {
        this.context.eventStream.post(new DotnetUninstallAllStarted());

        this.acquisitionPromises = {};

        this.removeFolderRecursively(this.context.installDirectoryProvider.getStoragePath());

        await this.context.extensionState.update(this.installingVersionsKey, []);
        await this.context.extensionState.update(this.installedVersionsKey, []);

        this.context.eventStream.post(new DotnetUninstallAllCompleted());
    }

    public async acquireSDK(version: string): Promise<IDotnetAcquireResult> {
        return this.acquire(version, false);
    }

    public async acquireRuntime(version: string): Promise<IDotnetAcquireResult> {
        return this.acquire(version, true);
    }

    public async acquireStatus(version: string, installRuntime: boolean, architecture? : string): Promise<IDotnetAcquireResult | undefined> {
        const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(version, architecture ? architecture : this.installingArchitecture)

        const existingAcquisitionPromise = this.acquisitionPromises[installKey];
        if (existingAcquisitionPromise) {
            // Requested version is being acquired
            this.context.eventStream.post(new DotnetAcquisitionStatusResolved(installKey));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        }

        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(installKey);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);
        let installedVersions = this.context.extensionState.get<string[]>(this.installedVersionsKey, []);

        if (installedVersions.length === 0 && fs.existsSync(dotnetPath) && !installRuntime) {
            // The education bundle already laid down a local install, add it to our managed installs
            installedVersions = await this.managePreinstalledVersion(dotnetInstallDir, installedVersions);
        }

        if (installedVersions.includes(installKey) && fs.existsSync(dotnetPath)) {
            // Requested version has already been installed.
            this.context.eventStream.post(new DotnetAcquisitionStatusResolved(installKey));
            return { dotnetPath };
        }

        // Version is not installed
        this.context.eventStream.post(new DotnetAcquisitionStatusUndefined(installKey));
        return undefined;
    }

    private async acquire(version: string, installRuntime: boolean): Promise<IDotnetAcquireResult>
    {
        const installKey = this.getInstallKey(version);
        const existingAcquisitionPromise = this.acquisitionPromises[installKey];
        if (existingAcquisitionPromise) {
            // This version of dotnet is already being acquired. Memoize the promise.
            this.context.eventStream.post(new DotnetAcquisitionInProgress(version,
                    (this.context.acquisitionContext && this.context.acquisitionContext.requestingExtensionId)
                    ? this.context.acquisitionContext!.requestingExtensionId : null));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        } else {
            // We're the only one acquiring this version of dotnet, start the acquisition process.
            const acquisitionPromise = this.acquireCore(version, installRuntime, installKey).catch((error: Error) => {
                delete this.acquisitionPromises[installKey];
                throw new Error(`.NET Acquisition Failed: ${error.message}`);
            });

            this.acquisitionPromises[installKey] = acquisitionPromise;
            return acquisitionPromise.then((res) => ({ dotnetPath: res }));
        }
    }

    public static getInstallKeyCustomArchitecture(version : string, architecture: string | null | undefined) : string
    {
        if(!architecture)
        {
            return version;
        }
        else
        {
            return `${version}-${architecture}`;
        }
    }

    public getInstallKey(version : string) : string
    {
        return DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(version, this.installingArchitecture);
    }

    private async acquireCore(version: string, installRuntime: boolean, installKey : string): Promise<string> {
        const installingVersions = this.context.extensionState.get<string[]>(this.installingVersionsKey, []);
        let installedVersions = this.context.extensionState.get<string[]>(this.installedVersionsKey, []);
        const partialInstall = installingVersions.indexOf(installKey) >= 0;

        if (partialInstall && installRuntime) {
            // Partial install, we never updated our extension to no longer be 'installing'.
            // uninstall everything and then re-install.
            this.context.eventStream.post(new DotnetAcquisitionPartialInstallation(installKey));

            await this.uninstallRuntimeOrSDK(version, installKey);
        } else if (partialInstall) {
            this.context.eventStream.post(new DotnetAcquisitionPartialInstallation(installKey));
            await this.uninstallAll();
        }

        await this.removeMatchingLegacyInstall(installedVersions, version);

        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(installKey);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);

        if (fs.existsSync(dotnetPath) && installedVersions.length === 0) {
            // The education bundle already laid down a local install, add it to our managed installs
            installedVersions = await this.managePreinstalledVersion(dotnetInstallDir, installedVersions);
        }

        if (installedVersions.includes(installKey) && fs.existsSync(dotnetPath)) {
            // Version requested has already been installed.
            this.context.installationValidator.validateDotnetInstall(installKey, dotnetPath);
            this.context.eventStream.post(new DotnetAcquisitionAlreadyInstalled(installKey,
                (this.context.acquisitionContext && this.context.acquisitionContext.requestingExtensionId)
                ? this.context.acquisitionContext!.requestingExtensionId : null));
            return dotnetPath;
        }

        // We update the extension state to indicate we're starting a .NET Core installation.
        await this.addVersionToExtensionState(this.installingVersionsKey, installKey);

        const installContext = {
            installDir: dotnetInstallDir,
            version,
            dotnetPath,
            timeoutValue: this.timeoutValue,
            installRuntime,
            architecture: this.installingArchitecture
        } as IDotnetInstallationContext;
        this.context.eventStream.post(new DotnetAcquisitionStarted(installKey, this.context.acquisitionContext?.requestingExtensionId));
        await this.context.acquisitionInvoker.installDotnet(installContext).catch((reason) => {
            throw Error(`Installation failed: ${reason}`);
        });
        this.context.installationValidator.validateDotnetInstall(installKey, dotnetPath);

        await this.removeVersionFromExtensionState(this.installingVersionsKey, installKey);
        await this.addVersionToExtensionState(this.installedVersionsKey, installKey);

        return dotnetPath;
    }

    public setAcquisitionContext(context : IDotnetAcquireContext)
    {
        this.context.acquisitionContext = context;
    }

    /**
     *
     * @param installedVersions - all of the currently installed versions of dotnet managed by the extension
     * @param version - the version that is about to be installed
     *
     * @remarks Before, installed versions used their version as the 'install key' in the promises and folder structure.
     * We changed this install key to include architecture so different architectures could be installed side-by-side.
     * This means any installs that were made before version 1.7.4 will not have the architecture in their install key.
     * They should be removed. This is what makes an install 'legacy'.
     *
     * This function only removes the legacy install with the same version as 'version'.
     * That's because removing other legacy installs may cause a breaking change.
     * Assuming the install succeeds, this will not break as the legacy install of 'version' will be replaced by a non-legacy one upon completion.
     *
     * Many (if not most) legacy installs will actually hold the same content as the newly installed runtime/sdk.
     * But since we don't want to be in the business of detecting their architecture, we chose this option as opposed to renaming and install key and folder
     * ... for the legacy install.
     *
     * Note : only local installs were ever 'legacy.'
     */
    private async removeMatchingLegacyInstall(installedVersions : string[], version : string)
    {
        const legacyInstalls = this.existingLegacyInstalls(installedVersions);
        for(const legacyInstall of legacyInstalls)
        {
            if(legacyInstall.includes(version))
            {
                await this.uninstallRuntimeOrSDK(version, legacyInstall);
            }
        }
    }

    /**
     *
     * @param allInstalls all of the existing installs.
     * @returns All existing installs made by the extension that don't include a - for the architecture.
     */
    private existingLegacyInstalls(allInstalls : string[]) : string[]
    {
        let legacyInstalls : string[] = [];
        for(const install of allInstalls)
        {
            if(!install.includes('-'))
            {
                // Check if sdk installs are counted here.
                legacyInstalls = legacyInstalls.concat(install);
            }
        }
        return legacyInstalls;
    }

    public async uninstallRuntimeOrSDK(version: string, installKey : string) {
        delete this.acquisitionPromises[installKey];

        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(installKey);
        this.removeFolderRecursively(dotnetInstallDir);

        await this.removeVersionFromExtensionState(this.installedVersionsKey, installKey);
        await this.removeVersionFromExtensionState(this.installingVersionsKey, installKey);
    }

    private async removeVersionFromExtensionState(key: string, installKey: string) {
        const state = this.context.extensionState.get<string[]>(key, []);
        const versionIndex = state.indexOf(installKey);
        if (versionIndex >= 0) {
            state.splice(versionIndex, 1);
            await this.context.extensionState.update(key, state);
        }
    }

    private async addVersionToExtensionState(key: string, installKey: string) {
        const state = this.context.extensionState.get<string[]>(key, []);
        state.push(installKey);
        await this.context.extensionState.update(key, state);
    }

    private removeFolderRecursively(folderPath: string) {
        this.context.eventStream.post(new DotnetAcquisitionDeletion(folderPath));
        rimraf.sync(folderPath);
    }

    private async managePreinstalledVersion(dotnetInstallDir: string, installedInstallKeys: string[]): Promise<string[]> {
        try {
            // Determine installed version(s)
            const installKeys = fs.readdirSync(path.join(dotnetInstallDir, 'sdk'));

            // Update extension state
            for (const installKey of installKeys) {
                this.context.eventStream.post(new DotnetPreinstallDetected(installKey));
                await this.addVersionToExtensionState(this.installedVersionsKey, installKey);
                installedInstallKeys.push(installKey);
            }
        } catch (error) {
            this.context.eventStream.post(new DotnetPreinstallDetectionError(error as Error));
        }
        return installedInstallKeys;
    }
}
