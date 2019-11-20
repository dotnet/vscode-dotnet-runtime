/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as cp from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { IEventStream } from './EventStream';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionInstallError,
    DotnetAcquisitionScriptError,
    DotnetAcquisitionUnexpectedError,
} from './EventStreamEvents';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';

export class AcquisitionInvoker extends IAcquisitionInvoker {
    protected scriptPath: string;
    
    constructor(scriptPath: string, eventStream: IEventStream) {
        super(eventStream);
        this.scriptPath = path.join(scriptPath, 'node_modules', 'dotnetcore-acquisition-library', 'install scripts', 'dotnet-install' + this.getScriptEnding());
    }

    private getInstallCommand(version: string, dotnetInstallDir: string): string {
        const args = [
            '-InstallDir', `'${dotnetInstallDir}'`, // Use single quotes instead of double quotes (see https://github.com/dotnet/cli/issues/11521)
            '-Runtime', 'dotnet',
            '-Version', version,
        ];

        return `"${this.scriptPath}" ${args.join(' ')}`;
    }
    protected getScriptEnding(): string {
        return os.platform() === 'win32' ? '.cmd' : '.sh';
    }

    public installDotnet(installContext: IDotnetInstallationContext): Promise<void> {
        const installCommand = this.getInstallCommand(installContext.version, installContext.installDir);
        return new Promise<void>((resolve, reject) => {
            try {
                cp.exec(installCommand, { cwd: process.cwd(), maxBuffer: 500 * 1024 }, (error, stdout, stderr) => {
                    if (error) {
                        this.eventStream.post(new DotnetAcquisitionInstallError(error, installContext.version));
                        reject(error);
                    } else if (stderr && stderr.length > 0) {
                        this.eventStream.post(new DotnetAcquisitionScriptError(stderr, installContext.version));
                        reject(stderr);
                    } else {
                        this.eventStream.post(new DotnetAcquisitionCompleted(installContext.version, installContext.dotnetPath));
                        resolve();
                    }
                });
            } catch (error) {
                this.eventStream.post(new DotnetAcquisitionUnexpectedError(error, installContext.version));
                reject(error);
            }
        });
    }
}
