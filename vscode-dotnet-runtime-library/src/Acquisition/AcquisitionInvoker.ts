/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import * as isOnline from 'is-online';
import * as os from 'os';
import { IEventStream } from '../EventStream/EventStream';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionInstallError,
    DotnetAcquisitionScriptError,
    DotnetAcquisitionScriptOuput,
    DotnetAcquisitionTimeoutError,
    DotnetAcquisitionUnexpectedError,
    DotnetOfflineFailure,
} from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';
import { timeoutConstants } from '../Utils/ErrorHandler';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';
import { InstallScriptAcquisitionWorker } from './InstallScriptAcquisitionWorker';

export class AcquisitionInvoker extends IAcquisitionInvoker {
    private readonly scriptWorker: IInstallScriptAcquisitionWorker;

    constructor(extensionState: IExtensionState, eventStream: IEventStream) {
        super(eventStream);
        this.scriptWorker = new InstallScriptAcquisitionWorker(extensionState, eventStream);
    }

    public async installDotnet(installContext: IDotnetInstallationContext): Promise<void> {
        const winOS = os.platform() === 'win32';
        const installCommand = await this.getInstallCommand(installContext.version, installContext.installDir, installContext.installRuntime);
        return new Promise<void>((resolve, reject) => {
            try {
                const windowsFullCommand = `powershell.exe -NoProfile -ExecutionPolicy unrestricted -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 ; & ${installCommand} }`;
                cp.exec(winOS ? windowsFullCommand : installCommand,
                        { cwd: process.cwd(), maxBuffer: 500 * 1024, timeout: 1000 * installContext.timeoutValue, killSignal: 'SIGKILL' },
                        async (error, stdout, stderr) => {
                    if (error) {
                        if (stdout) {
                            this.eventStream.post(new DotnetAcquisitionScriptOuput(installContext.version, stdout));
                        }
                        if (stderr) {
                            this.eventStream.post(new DotnetAcquisitionScriptOuput(installContext.version, `STDERR: ${stderr}`));
                        }

                        const online = await isOnline();
                        if (!online) {
                            const offlineError = new Error('No internet connection: Cannot install .NET');
                            this.eventStream.post(new DotnetOfflineFailure(offlineError, installContext.version));
                            reject(offlineError);
                        } else if (error.signal === 'SIGKILL') {
                            error.message = timeoutConstants.timeoutMessage;
                            this.eventStream.post(new DotnetAcquisitionTimeoutError(error, installContext.version, installContext.timeoutValue));
                            reject(error);
                        } else {
                            this.eventStream.post(new DotnetAcquisitionInstallError(error, installContext.version));
                            reject(error);
                        }
                    } else if (stderr && stderr.length > 0) {
                        this.eventStream.post(new DotnetAcquisitionScriptError(new Error(stderr), installContext.version));
                        reject(stderr);
                    } else {
                        this.eventStream.post(new DotnetAcquisitionCompleted(installContext.version, installContext.dotnetPath));
                        resolve();
                    }
                });
            } catch (error) {
                this.eventStream.post(new DotnetAcquisitionUnexpectedError(error as Error, installContext.version));
                reject(error);
            }
        });
    }

    private async getInstallCommand(version: string, dotnetInstallDir: string, installRuntime: boolean): Promise<string> {
        let args = [
            '-InstallDir', this.escapeFilePath(dotnetInstallDir),
            '-Version', version,
        ];
        if (installRuntime) {
            args = args.concat('-Runtime', 'dotnet');
        }

        const scriptPath = await this.scriptWorker.getDotnetInstallScriptPath();
        return `${ this.escapeFilePath(scriptPath) } ${ args.join(' ') }`;
    }

    private escapeFilePath(path: string): string {
        if (os.platform() === 'win32') {
            // Need to escape apostrophes with two apostrophes
            const dotnetInstallDirEscaped = path.replace(/'/g, `''`);

            // Surround with single quotes instead of double quotes (see https://github.com/dotnet/cli/issues/11521)
            return `'${dotnetInstallDirEscaped}'`;
        } else {
            return `"${path}"`;
        }
    }
}
