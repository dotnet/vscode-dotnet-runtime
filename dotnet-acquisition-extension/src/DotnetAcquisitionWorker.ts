/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');
import { EventStream } from './EventStream';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionInstallError,
    DotnetAcquisitionScriptError,
    DotnetAcquisitionStarted,
    DotnetAcquisitionUnexpectedError,
} from './EventStreamEvents';

export class DotnetAcquisitionWorker {
    private readonly installDir: string;
    private readonly dotnetPath: string;
    private readonly scriptPath: string;
    private readonly lockFilePath: string;
    private readonly beginFilePath: string;
    private latestAcquisitionPromise: Promise<string> | undefined;
    private acquisitionPromises: { [version: string]: Promise<string> | undefined };

    constructor(
        private readonly extensionPath: string,
        private readonly eventStream: EventStream) {
        const script = os.platform() === 'win32' ? 'dotnet-install.cmd' : 'dotnet-install.sh';
        this.scriptPath = path.join(this.extensionPath, 'scripts', script);
        this.installDir = path.join(this.extensionPath, '.dotnet');
        this.lockFilePath = path.join(this.extensionPath, 'install.lock');
        this.beginFilePath = path.join(this.extensionPath, 'install.begin');
        this.dotnetPath = path.join(this.installDir, 'dotnet');
        this.acquisitionPromises = {};
    }

    public uninstallAll() {
        this.acquisitionPromises = {};
        this.latestAcquisitionPromise = undefined;

        rimraf.sync(this.installDir);

        if (fs.existsSync(this.beginFilePath)) {
            fs.unlinkSync(this.beginFilePath);
        }

        if (fs.existsSync(this.lockFilePath)) {
            fs.unlinkSync(this.lockFilePath);
        }
    }

    public acquire(version: string): Promise<string> {
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
        if (fs.existsSync(this.beginFilePath)) {
            // Partial install, we never wrote the lock file, uninstall everything and then re-install.
            this.uninstallAll();
        }

        const lockFileExists = fs.existsSync(this.lockFilePath);
        if (lockFileExists && !fs.existsSync(this.installDir)) {
            // User nuked the .NET Core tooling install directory and didn't nuke the lock file. We need to clean up
            // all of our informational assets to ensure we work properly.
            this.uninstallAll();
        }

        let installedVersions: string[] = [];
        if (lockFileExists) {
            const lockFileVersionsRaw = fs.readFileSync(this.lockFilePath);
            installedVersions = lockFileVersionsRaw.toString().split('|');
        }

        if (version && installedVersions.indexOf(version) >= 0) {
            // Version requested has already been installed.
            return this.dotnetPath;
        }

        // We render the begin lock file to indicate that we're starting a .NET Core installation.
        fs.writeFileSync(this.beginFilePath, version);

        const args = [
            '-InstallDir', this.installDir,
            '-Runtime', 'dotnet',
            '-Version', version,
        ];

        const installCommand = `${this.scriptPath} ${args.join(' ')}`;

        this.eventStream.post(new DotnetAcquisitionStarted(version));
        await this.installDotnet(installCommand);

        if (version) {
            installedVersions.push(version);
        }

        const installedVersionsString = installedVersions.join('|');
        fs.writeFileSync(this.lockFilePath, installedVersionsString);

        if (fs.existsSync(this.beginFilePath)) {
            // This should always exist unless the user mucked with the installation directory. We're just being extra safe here.
            fs.unlinkSync(this.beginFilePath);
        }

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
