/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import * as os from 'os';
import { Memento } from 'vscode';
import { IEventStream } from './EventStream';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionInstallError,
    DotnetAcquisitionScriptError,
    DotnetAcquisitionScriptOuput,
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
        const winOS = os.platform() === 'win32';
        const installCommand = await this.getInstallCommand(installContext.version, installContext.installDir);
        return new Promise<void>((resolve, reject) => {
            try {
                cp.exec(winOS ? `powershell.exe -ExecutionPolicy unrestricted -File ${installCommand}` : installCommand,
                        { cwd: process.cwd(), maxBuffer: 500 * 1024 },
                        (error, stdout, stderr) => {
                    if (stdout) {
                        this.eventStream.post(new DotnetAcquisitionScriptOuput(installContext.version, stdout));
                    }
                    if (stderr) {
                        this.eventStream.post(new DotnetAcquisitionScriptOuput(installContext.version, `STDERR: ${stderr}`));
                    }

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
            '-InstallDir', `"${dotnetInstallDir}"`,
            '-Runtime', 'dotnet',
            '-Version', version,
        ];

        const scriptPath = await this.scriptWorker.getDotnetInstallScriptPath();
        return `"${ scriptPath }" ${ args.join(' ') }`;
    }
}
