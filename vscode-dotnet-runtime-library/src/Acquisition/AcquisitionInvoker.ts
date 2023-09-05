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
import { TelemetryUtilities } from '../EventStream/TelemetryUtilities';

export class AcquisitionInvoker extends IAcquisitionInvoker {
    private readonly scriptWorker: IInstallScriptAcquisitionWorker;

    private noPowershellError = `powershell.exe is not discoverable on your system. Is PowerShell added to your PATH and correctly installed? Please visit: https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows.
You will need to restart VS Code after these changes. If PowerShell is still not discoverable, try setting a custom existingDotnetPath following our instructions here: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md.`

    constructor(extensionState: IExtensionState, eventStream: IEventStream, timeoutTime : number) {
        super(eventStream);
        this.scriptWorker = new InstallScriptAcquisitionWorker(extensionState, eventStream, timeoutTime);
    }

    public async installDotnet(installContext: IDotnetInstallationContext): Promise<void> {
        const winOS = os.platform() === 'win32';
        const installCommand = await this.getInstallCommand(installContext.version, installContext.installDir, installContext.installRuntime);
        return new Promise<void>((resolve, reject) => {
            try {
                const windowsFullCommand = `powershell.exe -NoProfile -ExecutionPolicy unrestricted -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 ; & ${installCommand} }`;
                if(winOS)
                {
                    this.verifyPowershellCanRun(installContext);
                }

                cp.exec(winOS ? windowsFullCommand : installCommand,
                        { cwd: process.cwd(), maxBuffer: 500 * 1024, timeout: 1000 * installContext.timeoutValue, killSignal: 'SIGKILL' },
                        async (error, stdout, stderr) => {
                    if (error) {
                        if (stdout) {
                            this.eventStream.post(new DotnetAcquisitionScriptOuput(installContext.version, TelemetryUtilities.HashAllPaths(stdout)));
                        }
                        if (stderr) {
                            this.eventStream.post(new DotnetAcquisitionScriptOuput(installContext.version, `STDERR: ${TelemetryUtilities.HashAllPaths(stderr)}`));
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
                        this.eventStream.post(new DotnetAcquisitionScriptError(new Error(TelemetryUtilities.HashAllPaths(stderr)), installContext.version));
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
            '-Verbose'
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

    /**
     *
     * @remarks Some users have reported not having powershell.exe or having execution policy that fails property evaluation functions in powershell install scripts.
     * We use this function to throw better errors if powershell is not configured correctly.
     */
    private async verifyPowershellCanRun(installContext : IDotnetInstallationContext)
    {
        let knownError = false;
        let error = null;

        try
        {
            // Check if PowerShell exists and is on the path.
            const exeFoundOutput = cp.spawnSync(`powershell`);
            if(exeFoundOutput.status !== 0)
            {
                knownError = true;
                const err = Error(this.noPowershellError);
                error = err;
            }

            // Check Execution Policy
            const execPolicyOutput = cp.spawnSync(`powershell`, [`-command`, `$ExecutionContext.SessionState.LanguageMode`]);
            const languageMode = execPolicyOutput.stdout.toString().trim();
            if(languageMode === 'ConstrainedLanguage' || languageMode === 'NoLanguage')
            {
                knownError = true;
                const err = Error(`Your machine policy disables PowerShell language features that may be needed to install .NET. Read more at: https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_language_modes?view=powershell-7.3.
If you cannot safely and confidently change the execution policy, try setting a custom existingDotnetPath following our instructions here: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md.`);
                error = err;
            }
        }
        catch(err)
        {
            if(!knownError)
            {
                error = new Error(`${this.noPowershellError} More details: ${(err as Error).message}`);
            }
        }

        if(error != null)
        {
            this.eventStream.post(new DotnetAcquisitionScriptError(error as Error, installContext.version));
            throw error;
        }
    }
}
