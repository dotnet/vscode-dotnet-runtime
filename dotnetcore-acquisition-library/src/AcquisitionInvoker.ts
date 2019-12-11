/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import { Memento } from 'vscode';
import { IEventStream } from './EventStream';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionInstallError,
    DotnetAcquisitionScriptError,
    DotnetAcquisitionUnexpectedError,
} from './EventStreamEvents';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';
import { InstallScriptAcquisitionWorker } from './InstallScriptAcquisitionWorker';

export class AcquisitionInvoker extends IAcquisitionInvoker {
    private readonly scriptWorker: IInstallScriptAcquisitionWorker;

    constructor(extensionState: Memento, eventStream: IEventStream) {
        super(eventStream);
        this.scriptWorker = new InstallScriptAcquisitionWorker(extensionState, eventStream);
    }

    public async installDotnet(installContext: IDotnetInstallationContext): Promise<void> {
        const installCommand = await this.getInstallCommand(installContext.version, installContext.installDir);
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

    private async getInstallCommand(version: string, dotnetInstallDir: string): Promise<string> {
        const args = [
            '-InstallDir', `'${dotnetInstallDir}'`, // Use single quotes instead of double quotes (see https://github.com/dotnet/cli/issues/11521)
            '-Runtime', 'dotnet',
            '-Version', version,
        ]; // TODO add no-path option?

        const scriptPath = await this.scriptWorker.getDotnetInstallScriptPath();
        return `"${ scriptPath }" ${ args.join(' ') }`;
    }
}
