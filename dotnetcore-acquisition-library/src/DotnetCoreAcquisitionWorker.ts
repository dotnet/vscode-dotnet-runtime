/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');
import { Memento } from 'vscode';
import { EventStream } from './EventStream';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionInstallError,
    DotnetAcquisitionScriptError,
    DotnetAcquisitionStarted,
    DotnetAcquisitionUnexpectedError,
} from './EventStreamEvents';

export class DotnetCoreAcquisitionWorker {
    private readonly installedVersionsKey = 'acquisitions';
    private readonly installingKey = 'installing';
    private readonly installDir: string;
    private readonly dotnetPath: string;
    private readonly scriptPath: string;

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

    private latestAcquisitionPromise: Promise<string> | undefined;
    private acquisitionPromises: { [version: string]: Promise<string> | undefined };

    constructor(
        extensionPath: string,
        private readonly storagePath: string,
        private readonly extensionState: Memento,
        private readonly eventStream: EventStream) {
        const script = os.platform() === 'win32' ? 'dotnet-install.cmd' : 'dotnet-install.sh';
        this.scriptPath = path.join(extensionPath, 'node_modules', 'dotnetcore-acquisition-library', 'scripts', script);
        this.installDir = path.join(this.storagePath, '.dotnet');
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.dotnetPath = path.join(this.installDir, `dotnet${dotnetExtension}`);
        this.acquisitionPromises = {};
    }

    public async uninstallAll() {
        this.acquisitionPromises = {};
        this.latestAcquisitionPromise = undefined;

        rimraf.sync(this.installDir);

        await this.extensionState.update(this.installingKey, false);
        await this.extensionState.update(this.installedVersionsKey, []);
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
        } else if (this.latestAcquisitionPromise) {
            // There are other versions of dotnet being acquired. Wait for them to be finish
            // then start the acquisition process.

            const acquisitionPromise = this.latestAcquisitionPromise
                .catch(/* swallow exceptions because listeners to this promise are unrelated. */)
                .finally(() => this.acquireCore(version));

            // We're now the latest acquisition promise
            this.latestAcquisitionPromise = acquisitionPromise;

            this.acquisitionPromises[version] = acquisitionPromise;
            return acquisitionPromise;
        } else {
            // We're the only version of dotnet being acquired, start the acquisition process.

            const acquisitionPromise = this.acquireCore(version);

            // We're now the latest acquisition promise
            this.latestAcquisitionPromise = acquisitionPromise;

            this.acquisitionPromises[version] = acquisitionPromise;
            return acquisitionPromise;
        }
    }

    private async acquireCore(version: string): Promise<string> {
        const partialInstall = this.extensionState.get(this.installingKey, false);
        if (partialInstall) {
            // Partial install, we never updated our extension to no longer be 'installing'.
            // uninstall everything and then re-install.
            await this.uninstallAll();
        }

        const installedVersions = this.extensionState.get<string[]>(this.installedVersionsKey, []);
        if (installedVersions.length > 0 && !fs.existsSync(this.installDir)) {
            // User nuked the .NET Core tooling install directory manually. We need to clean up
            // all of our state to ensure we work properly.
            await this.uninstallAll();
            installedVersions.length = 0;
        }

        if (version && installedVersions.indexOf(version) >= 0) {
            // Version requested has already been installed.
            return this.dotnetPath;
        }

        // We update the extension state to indicate we're starting a .NET Core installation.
        await this.extensionState.update(this.installingKey, true);

        const args = [
            '-InstallDir', `"${this.installDir}"`,
            '-Runtime', 'dotnet',
            '-Version', version,
        ];

        const installCommand = `${this.scriptPath} ${args.join(' ')}`;

        this.eventStream.post(new DotnetAcquisitionStarted(version));
        await this.installDotnet(installCommand);

        installedVersions.push(version);

        await this.extensionState.update(this.installedVersionsKey, installedVersions);
        await this.extensionState.update(this.installingKey, false);

        return this.dotnetPath;
    }

    private installDotnet(installCommand: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                cp.exec(installCommand, { cwd: process.cwd(), maxBuffer: 500 * 1024 }, (error, stdout, stderr) => {
                    if (error) {
                        this.eventStream.post(new DotnetAcquisitionInstallError(error));
                        reject(error);
                    } else if (stderr && stderr.length > 0) {
                        this.eventStream.post(new DotnetAcquisitionScriptError(stderr));
                        reject(stderr);
                    } else {
                        this.eventStream.post(new DotnetAcquisitionCompleted(this.dotnetPath));
                        resolve();
                    }
                });
            } catch (error) {
                this.eventStream.post(new DotnetAcquisitionUnexpectedError(error));
                reject(error);
            }
        });
    }
}
