/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');
import {
    DotnetAcquisitionAlreadyInstalled,
    DotnetAcquisitionDeletion,
    DotnetAcquisitionInProgress,
    DotnetAcquisitionPartialInstallation,
    DotnetAcquisitionStarted,
    DotnetUninstallAllCompleted,
    DotnetUninstallAllStarted,
} from '../EventStream/EventStreamEvents';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetCoreAcquisitionWorker } from './IDotnetCoreAcquisitionWorker';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';

export class DotnetCoreAcquisitionWorker implements IDotnetCoreAcquisitionWorker {
    private readonly installingVersionsKey = 'installing';
    private readonly installDir: string;
    private readonly dotnetExecutable: string;
    private readonly timeoutValue: number;

    private acquisitionPromises: { [version: string]: Promise<string> | undefined };

    constructor(private readonly context: IAcquisitionWorkerContext) {
        const installFolderName = process.env._VSCODE_DOTNET_INSTALL_FOLDER || '.dotnet';
        this.installDir = path.join(this.context.storagePath, installFolderName);
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.timeoutValue = context.timeoutValue;
        this.acquisitionPromises = {};
    }

    public async uninstallAll() {
        this.context.eventStream.post(new DotnetUninstallAllStarted());

        this.acquisitionPromises = {};

        this.removeFolderRecursively(this.installDir);

        await this.context.extensionState.update(this.installingVersionsKey, []);

        this.context.eventStream.post(new DotnetUninstallAllCompleted());
    }

    public async acquireSDK(version: string): Promise<IDotnetAcquireResult> {
        return this.acquire(version, false);
    }

    public async acquireRuntime(version: string): Promise<IDotnetAcquireResult> {
        return this.acquire(version, true);
    }

    private async acquire(version: string, installRuntime: boolean): Promise<IDotnetAcquireResult> {
        const existingAcquisitionPromise = this.acquisitionPromises[version];
        if (existingAcquisitionPromise) {
            // This version of dotnet is already being acquired. Memoize the promise.
            this.context.eventStream.post(new DotnetAcquisitionInProgress(version));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        } else {
            // We're the only one acquiring this version of dotnet, start the acquisition process.
            const acquisitionPromise = this.acquireCore(version, installRuntime).catch((error: Error) => {
                delete this.acquisitionPromises[version];
                throw new Error(`.NET Acquisition Failed: ${error.message}`);
            });

            this.acquisitionPromises[version] = acquisitionPromise;
            return acquisitionPromise.then((res) => ({ dotnetPath: res }));
        }
    }

    private async acquireCore(version: string, installRuntime: boolean): Promise<string> {
        const installingVersions = this.context.extensionState.get<string[]>(this.installingVersionsKey, []);
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

        const dotnetInstallDir = this.context.installDirectoryProvider.getDotnetInstallDir(version, this.installDir);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);

        if (this.context.installDirectoryProvider.isBundleInstalled(dotnetPath, version, this.context.extensionState, this.installingVersionsKey)) {
            // Version requested has already been installed.
            this.context.installationValidator.validateDotnetInstall(version, dotnetPath);
            this.context.eventStream.post(new DotnetAcquisitionAlreadyInstalled(version));
            return dotnetPath;
        }

        // We update the extension state to indicate we're starting a .NET Core installation.
        installingVersions.push(version);
        await this.context.extensionState.update(this.installingVersionsKey, installingVersions);

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

        // Need to re-query our installing versions because there may have been concurrent acquisitions that
        // changed its value.
        const latestInstallingVersions = this.context.extensionState.get<string[]>(this.installingVersionsKey, []);
        const versionIndex = latestInstallingVersions.indexOf(version);
        if (versionIndex >= 0) {
            latestInstallingVersions.splice(versionIndex, 1);
            await this.context.extensionState.update(this.installingVersionsKey, latestInstallingVersions);
        }

        return dotnetPath;
    }

    private async uninstallRuntime(version: string) {
        delete this.acquisitionPromises[version];

        const dotnetInstallDir = this.context.installDirectoryProvider.getDotnetInstallDir(version, this.installDir);
        this.removeFolderRecursively(dotnetInstallDir);

        const installingVersions = this.context.extensionState.get<string[]>(this.installingVersionsKey, []);
        const versionIndex = installingVersions.indexOf(version);
        if (versionIndex >= 0) {
            installingVersions.splice(versionIndex, 1);
            await this.context.extensionState.update(this.installingVersionsKey, installingVersions);
        }
    }

    private removeFolderRecursively(folderPath: string) {
        this.context.eventStream.post(new DotnetAcquisitionDeletion(folderPath));
        rimraf.sync(folderPath);
    }
}
