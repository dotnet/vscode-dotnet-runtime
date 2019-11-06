/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');
import { Memento } from 'vscode';
import { IEventStream } from './EventStream';
import { DotnetAcquisitionStarted } from './EventStreamEvents';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';

export class DotnetCoreAcquisitionWorker {
    private readonly installingVersionsKey = 'installing';
    private readonly installDir: string;
    private readonly dotnetExecutable: string;

    // TODO: Represent this in package.json OR utilize the channel argument in dotnet-install to dynamically acquire the
    // latest for a specific channel. Concerns for using the dotnet-install channel mechanism:
    //  1. Is the specified "latest" version available on the CDN yet?
    //  2. Would need to build a mechanism to occasionally query latest so you don't pay the cost on every acquire.
    private readonly latestVersionMap: { [version: string]: string | undefined } = {
        '1.0': '1.0.16',
        '1.1': '1.1.13',
        '2.0': '2.0.9',
        '2.1': '2.1.11',
        '2.2': '2.2.5',
    };

    private acquisitionPromises: { [version: string]: Promise<string> | undefined };

    constructor(private readonly storagePath: string,
        private readonly extensionState: Memento,
        private readonly eventStream: IEventStream,
        private readonly acquisitionInvoker: IAcquisitionInvoker) {
        this.installDir = path.join(this.storagePath, '.dotnet');
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.acquisitionPromises = {};
    }

    public async uninstallAll() {
        this.acquisitionPromises = {};

        rimraf.sync(this.installDir);

        await this.extensionState.update(this.installingVersionsKey, []);
    }

    public acquire(version: string): Promise<string> {
        const resolvedVersion = this.latestVersionMap[version];
        if (resolvedVersion) {
            version = resolvedVersion;
        }

        const existingAcquisitionPromise = this.acquisitionPromises[version];
        if (existingAcquisitionPromise) {
            // This version of dotnet is already being acquired. Memoize the promise.

            return existingAcquisitionPromise;
        } else {
            // We're the only one acquiring this version of dotnet, start the acquisition process.

            const acquisitionPromise = this.acquireCore(version).catch(error => {
                delete this.acquisitionPromises[version];
                throw error;
            });

            this.acquisitionPromises[version] = acquisitionPromise;
            return acquisitionPromise;
        }
    }

    private async acquireCore(version: string): Promise<string> {
        const installingVersions = this.extensionState.get<string[]>(this.installingVersionsKey, []);
        const partialInstall = installingVersions.indexOf(version) >= 0;
        if (partialInstall) {
            // Partial install, we never updated our extension to no longer be 'installing'.
            // uninstall everything and then re-install.
            await this.uninstall(version);
        }

        const dotnetInstallDir = this.getDotnetInstallDir(version);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);

        if (fs.existsSync(dotnetPath)) {
            // Version requested has already been installed.
            return dotnetPath;
        }

        // We update the extension state to indicate we're starting a .NET Core installation.
        installingVersions.push(version);
        await this.extensionState.update(this.installingVersionsKey, installingVersions);

        this.eventStream.post(new DotnetAcquisitionStarted(version));
        await this.acquisitionInvoker.installDotnet(dotnetInstallDir, version, dotnetPath);

        // Need to re-query our installing versions because there may have been concurrent acquisitions that
        // changed its value.
        const latestInstallingVersions = this.extensionState.get<string[]>(this.installingVersionsKey, []);
        const versionIndex = latestInstallingVersions.indexOf(version);
        if (versionIndex >= 0) {
            latestInstallingVersions.splice(versionIndex, 1);
            await this.extensionState.update(this.installingVersionsKey, latestInstallingVersions);
        }

        return dotnetPath;
    }
    
    private async uninstall(version: string) {
        delete this.acquisitionPromises[version];

        const dotnetInstallDir = this.getDotnetInstallDir(version);
        rimraf.sync(dotnetInstallDir);

        const installingVersions = this.extensionState.get<string[]>(this.installingVersionsKey, []);
        const versionIndex = installingVersions.indexOf(version);
        if (versionIndex >= 0) {
            installingVersions.splice(versionIndex, 1);
            await this.extensionState.update(this.installingVersionsKey, installingVersions);
        }
    }

    private getDotnetInstallDir(version: string) {
        const dotnetInstallDir = path.join(this.installDir, version)
        return dotnetInstallDir;
    }
}
