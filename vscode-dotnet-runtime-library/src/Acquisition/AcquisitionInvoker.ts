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
    DotnetAcquisitionScriptOutput,
    DotnetAcquisitionTimeoutError,
    DotnetAcquisitionUnexpectedError,
    DotnetAlternativeCommandFoundEvent,
    DotnetCommandFallbackArchitectureEvent,
    DotnetCommandNotFoundEvent,
    DotnetOfflineFailure,
} from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';
import { timeoutConstants } from '../Utils/ErrorHandler';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';
import { InstallScriptAcquisitionWorker } from './InstallScriptAcquisitionWorker';
import { TelemetryUtilities } from '../EventStream/TelemetryUtilities';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';

export class AcquisitionInvoker extends IAcquisitionInvoker {
    protected readonly scriptWorker: IInstallScriptAcquisitionWorker;

    private noPowershellError = `powershell.exe is not discoverable on your system. Is PowerShell added to your PATH and correctly installed? Please visit: https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows.
You will need to restart VS Code after these changes. If PowerShell is still not discoverable, try setting a custom existingDotnetPath following our instructions here: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md.`

    constructor(extensionState: IExtensionState, eventStream: IEventStream, timeoutTime : number) {
        super(eventStream);
        this.scriptWorker = new InstallScriptAcquisitionWorker(extensionState, eventStream, timeoutTime);
    }

    public async installDotnet(installContext: IDotnetInstallationContext): Promise<void> {
        const winOS = os.platform() === 'win32';
        const installCommand = await this.getInstallCommand(installContext.version, installContext.installDir, installContext.installRuntime, installContext.architecture);
        const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(installContext.version, installContext.architecture);

        return new Promise<void>((resolve, reject) => {
            try {
                let windowsFullCommand = `powershell.exe -NoProfile -NonInteractive -NoLogo -ExecutionPolicy unrestricted -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; & ${installCommand} }"`;
                if(winOS)
                {
                    const powershellReference =  this.verifyPowershellCanRun(installContext);
                    windowsFullCommand = windowsFullCommand.replace('powershell.exe', powershellReference);
                }

                cp.exec(winOS ? windowsFullCommand : installCommand,
                        { cwd: process.cwd(), maxBuffer: 500 * 1024, timeout: 1000 * installContext.timeoutValue, killSignal: 'SIGKILL' },
                        async (error, stdout, stderr) => {
                    if (error) {
                        if (stdout) {
                            this.eventStream.post(new DotnetAcquisitionScriptOutput(installKey, TelemetryUtilities.HashAllPaths(stdout)));
                        }
                        if (stderr) {
                            this.eventStream.post(new DotnetAcquisitionScriptOutput(installKey, `STDERR: ${TelemetryUtilities.HashAllPaths(stderr)}`));
                        }

                        const online = await isOnline();
                        if (!online) {
                            const offlineError = new Error('No internet connection: Cannot install .NET');
                            this.eventStream.post(new DotnetOfflineFailure(offlineError, installKey));
                            reject(offlineError);
                        } else if (error.signal === 'SIGKILL') {
                            error.message = timeoutConstants.timeoutMessage;
                            this.eventStream.post(new DotnetAcquisitionTimeoutError(error, installKey, installContext.timeoutValue));
                            reject(error);
                        } else {
                            this.eventStream.post(new DotnetAcquisitionInstallError(error, installKey));
                            reject(error);
                        }
                    } else if (stderr && stderr.length > 0) {
                        this.eventStream.post(new DotnetAcquisitionScriptError(new Error(TelemetryUtilities.HashAllPaths(stderr)), installKey));
                        reject(stderr);
                    } else {
                        this.eventStream.post(new DotnetAcquisitionCompleted(installKey, installContext.dotnetPath, installContext.version));
                        resolve();
                    }
                });
            } catch (error) {
                this.eventStream.post(new DotnetAcquisitionUnexpectedError(error as Error, installKey));
                reject(error);
            }
        });
    }

    private async getInstallCommand(version: string, dotnetInstallDir: string, installRuntime: boolean, architecture: string): Promise<string> {
        const arch = this.nodeArchToDotnetArch(architecture);
        let args = [
            '-InstallDir', this.escapeFilePath(dotnetInstallDir),
            '-Version', version,
            '-Verbose'
        ];
        if (installRuntime) {
            args = args.concat('-Runtime', 'dotnet');
        }
        if(arch !== 'auto')
        {
            args = args.concat('-Architecture', arch);
        }

        const scriptPath = await this.scriptWorker.getDotnetInstallScriptPath();
        return `${ this.escapeFilePath(scriptPath) } ${ args.join(' ') }`;
    }

    /**
     *
     * @param nodeArchitecture the architecture in node style string of what to install
     * @returns the architecture in the style that .net / the .net install scripts expect
     *
     * Node - amd64 is documented as an option for install scripts but its no longer used.
     * s390x is also no longer used.
     * ppc64le is supported but this version of node has no distinction of the endianness of the process.
     * It has no mapping to mips or other node architectures.
     *
     * @remarks Falls back to string 'auto' if a mapping does not exist which is not a valid architecture.
     */
    private nodeArchToDotnetArch(nodeArchitecture : string)
    {
        switch(nodeArchitecture)
        {
            case 'x64': {
                return nodeArchitecture;
            }
            case 'ia32': {
                return 'x86';
            }
            case 'x86': {
                // In case the function is called twice
                return 'x86';
            }
            case 'arm': {
                return nodeArchitecture;
            }
            case 'arm64': {
                return nodeArchitecture;
            }
            case 's390x': {
                return 's390x';
            }
            default: {
                this.eventStream.post(new DotnetCommandFallbackArchitectureEvent(`The architecture ${os.arch()} of the platform is unexpected, falling back to auto-arch.`));
                return 'auto';
            }
        }
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

    private TryFindWorkingCommand(commands : string[]) : [string, boolean]
    {
        for(const command of commands)
        {
            try
            {
                const cmdFoundOutput = cp.spawnSync(command);
                if(cmdFoundOutput.status === 0)
                {
                    this.eventStream.post(new DotnetAlternativeCommandFoundEvent(`The command ${command} was found.`));
                    return [command, true];
                }
                else
                {
                    this.eventStream.post(new DotnetCommandNotFoundEvent(`The command ${command} was NOT found, no error was thrown.`));
                }
            }
            catch(err)
            {
                // Do nothing. The error should be raised higher up.
                this.eventStream.post(new DotnetCommandNotFoundEvent(`The command ${command} was NOT found, and we caught any errors.`));
            }
        }
        return ['', false];
    }

    /**
     *
     * @remarks Some users have reported not having powershell.exe or having execution policy that fails property evaluation functions in powershell install scripts.
     * We use this function to throw better errors if powershell is not configured correctly.
     */
    private verifyPowershellCanRun(installContext : IDotnetInstallationContext) : string
    {
        let knownError = false;
        let error = null;
        let command = '';

        try
        {
            // Check if PowerShell exists and is on the path.
            const commandWorking = this.TryFindWorkingCommand([`powershell.exe`, `%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, `pwsh`, `powershell`, `pwsh.exe`]);
            if(!commandWorking[1])
            {
                knownError = true;
                const err = Error(this.noPowershellError);
                error = err;
            }
            else
            {
                command = commandWorking[0];
            }

            // Check Execution Policy
            const execPolicyOutput = cp.spawnSync(command, [`-command`, `$ExecutionContext.SessionState.LanguageMode`]);
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
            const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(installContext.version, installContext.architecture);
            this.eventStream.post(new DotnetAcquisitionScriptError(error as Error, installKey));
            throw error;
        }

        return command;
    }
}
