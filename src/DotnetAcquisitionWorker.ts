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
    private readonly scriptPath: string;
    private acquirePromise: Promise<void> | undefined;

    constructor(
        private readonly extensionPath: string,
        private readonly eventStream: EventStream) {
        const script = os.platform() === 'win32' ? 'dotnet-install.cmd' : 'dotnet-install.sh';
        this.scriptPath = path.join(this.extensionPath, 'scripts', script);
        this.installDir = path.join(this.extensionPath, '.dotnet');
    }

    public uninstallAll() {
        this.acquirePromise = undefined;
        rimraf.sync(this.installDir);
    }

    public async acquire(): Promise<void> {
        if (this.acquirePromise) {
            return this.acquirePromise;
        }
        const intermediateInstallDir = path.join(this.extensionPath, '.tempdotnet');
        let resolvedInstallDir = intermediateInstallDir;

        if (fs.existsSync(intermediateInstallDir)) {
            // Previous installation must have failed, need to clear the intermediate install dir.
            rimraf.sync(intermediateInstallDir);
        }

        if (fs.existsSync(this.installDir)) {
            // There has already been a dotnet installation that has succeded. The dotnet-install
            // scripts are smart about adding to the dotnet install.
            resolvedInstallDir = this.installDir;
        }

        const args = ['-InstallDir', resolvedInstallDir];
        const installCommand = `${this.scriptPath} ${args.join(' ')}`;

        this.acquirePromise = this.installDotnet(installCommand);

        this.eventStream.post(new DotnetAcquisitionStarted());
        await this.acquirePromise;

        fs.renameSync(resolvedInstallDir, this.installDir);
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
                        this.eventStream.post(new DotnetAcquisitionCompleted());
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
