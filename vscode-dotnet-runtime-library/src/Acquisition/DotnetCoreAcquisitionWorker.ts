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
    DotnetUninstallAllCompleted,
    DotnetUninstallAllStarted,
} from '../EventStream/EventStreamEvents';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';

export class DotnetCoreAcquisitionWorker {
    private readonly installingVersionsKey = 'installing';
    private readonly installDir: string;
    private readonly dotnetExecutable: string;

    private acquisitionPromises: { [version: string]: Promise<string> | undefined };

    constructor(private readonly context: IAcquisitionWorkerContext) {
        const installFolderName = process.env._VSCODE_DOTNET_INSTALL_FOLDER || '.dotnet';
        this.installDir = path.join(this.context.storagePath, installFolderName);
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.acquisitionPromises = {};
    }

    public async uninstallAll() {
        this.context.eventStream.post(new DotnetUninstallAllStarted());

        this.acquisitionPromises = {};

        this.removeFolderRecursively(this.installDir);

        await this.context.extensionState.update(this.installingVersionsKey, []);

        this.context.eventStream.post(new DotnetUninstallAllCompleted());
    }

    public async acquire(version: string): Promise<IDotnetAcquireResult> {
        version = await this.context.versionResolver.getFullVersion(version);

        const existingAcquisitionPromise = this.acquisitionPromises[version];
        if (existingAcquisitionPromise) {
            // This version of dotnet is already being acquired. Memoize the promise.
            this.context.eventStream.post(new DotnetAcquisitionInProgress(version));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        } else {
            // We're the only one acquiring this version of dotnet, start the acquisition process.

            const acquisitionPromise = this.acquireCore(version).catch((error: Error) => {
                delete this.acquisitionPromises[version];
                throw new Error(`Dotnet Core Acquisition Failed: ${error.message}`);
            });

            this.acquisitionPromises[version] = acquisitionPromise;
            return acquisitionPromise.then((res) => ({ dotnetPath: res }));
        }
    }

    private async acquireCore(version: string): Promise<string> {
        const installingVersions = this.context.extensionState.get<string[]>(this.installingVersionsKey, []);
        const partialInstall = installingVersions.indexOf(version) >= 0;
        if (partialInstall) {
            // Partial install, we never updated our extension to no longer be 'installing'.
            // uninstall everything and then re-install.
            this.context.eventStream.post(new DotnetAcquisitionPartialInstallation(version));

            await this.uninstall(version);
        }

        const dotnetInstallDir = this.getDotnetInstallDir(version);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);

        if (fs.existsSync(dotnetPath)) {
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
        } as IDotnetInstallationContext;
        this.context.eventStream.post(new DotnetAcquisitionStarted(version));
        await this.context.acquisitionInvoker.installDotnet(installContext);
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

    private async uninstall(version: string) {
        delete this.acquisitionPromises[version];

        const dotnetInstallDir = this.getDotnetInstallDir(version);
        this.removeFolderRecursively(dotnetInstallDir);

        const installingVersions = this.context.extensionState.get<string[]>(this.installingVersionsKey, []);
        const versionIndex = installingVersions.indexOf(version);
        if (versionIndex >= 0) {
            installingVersions.splice(versionIndex, 1);
            await this.context.extensionState.update(this.installingVersionsKey, installingVersions);
        }
    }

    private getDotnetInstallDir(version: string) {
        const dotnetInstallDir = path.join(this.installDir, version);
        return dotnetInstallDir;
    }

    private removeFolderRecursively(folderPath: string) {
        this.context.eventStream.post(new DotnetAcquisitionDeletion(folderPath));
        rimraf.sync(folderPath);
    }
}
