/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventStream } from './EventStream';
import { DotnetAcquisitionCompleted, DotnetAcquisitionInstallError, DotnetAcquisitionScriptError, DotnetAcquisitionUnexpectedError } from './EventStreamEvents';

export class DotnetAcquisitionWorker {
    private acquirePromise: Promise<void> | undefined;

    constructor(
        private readonly extensionPath: string,
        private readonly eventStream: EventStream) {
    }

    public async acquire(): Promise<void> {
        if (this.acquirePromise) {
            return this.acquirePromise;
        }

        const script = os.platform() === 'win32' ? 'dotnet-install.cmd' : 'dotnet-install.sh';
        const scriptPath = path.join(this.extensionPath, 'scripts', script);
        const installDir = path.join(this.extensionPath, '.dotnet');

        if (fs.existsSync(installDir)) {
            return;
        }

        const args = ['-InstallDir', installDir];
        const installCommand = `${scriptPath} ${args.join(' ')}`;

        this.acquirePromise = this.installDotnet(installCommand);

        return this.acquirePromise;
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
