/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as cp from 'child_process';
import * as isOnline from 'is-online';
import * as os from 'os';
import path = require('path');

import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionInstallError,
    DotnetAcquisitionScriptError,
    DotnetAcquisitionScriptOutput,
    DotnetAcquisitionTimeoutError,
    DotnetAcquisitionUnexpectedError,
    DotnetOfflineFailure,
} from '../EventStream/EventStreamEvents';

import { timeoutConstants } from '../Utils/ErrorHandler';
import { InstallScriptAcquisitionWorker } from './InstallScriptAcquisitionWorker';
import { TelemetryUtilities } from '../EventStream/TelemetryUtilities';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { FileUtilities } from '../Utils/FileUtilities';
import { CommandExecutor } from '../Utils/CommandExecutor';

import { IUtilityContext } from '../Utils/IUtilityContext';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';

export class AcquisitionInvoker extends IAcquisitionInvoker {
    protected readonly scriptWorker: IInstallScriptAcquisitionWorker;
    protected fileUtilities : FileUtilities;
    private noPowershellError = `powershell.exe is not discoverable on your system. Is PowerShell added to your PATH and correctly installed? Please visit: https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows.
You will need to restart VS Code after these changes. If PowerShell is still not discoverable, try setting a custom existingDotnetPath following our instructions here: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md.`

    constructor(private readonly workerContext : IAcquisitionWorkerContext, private readonly utilityContext : IUtilityContext) {

        super(workerContext.eventStream);
        this.scriptWorker = new InstallScriptAcquisitionWorker(workerContext);
        this.fileUtilities = new FileUtilities();
    }

    public async installDotnet(installContext: IDotnetInstallationContext): Promise<void>
    {
        const winOS = os.platform() === 'win32';
        const installCommand = await this.getInstallCommand(installContext.version, installContext.installDir, installContext.installRuntime, installContext.architecture);
        const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(installContext.version, installContext.architecture);

        return new Promise<void>(async (resolve, reject) =>
        {
            try
            {
                let windowsFullCommand = `powershell.exe -NoProfile -NonInteractive -NoLogo -ExecutionPolicy unrestricted -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; & ${installCommand} }"`;
                if(winOS)
                {
                    const powershellReference = await this.verifyPowershellCanRun(installContext);
                    windowsFullCommand = windowsFullCommand.replace('powershell.exe', powershellReference);
                }

                cp.exec(winOS ? windowsFullCommand : installCommand,
                        { cwd: process.cwd(), maxBuffer: 500 * 1024, timeout: 1000 * installContext.timeoutSeconds, killSignal: 'SIGKILL' },
                        async (error, stdout, stderr) =>
                {
                    if (error)
                    {
                        if (stdout)
                        {
                            this.eventStream.post(new DotnetAcquisitionScriptOutput(installKey, TelemetryUtilities.HashAllPaths(stdout)));
                        }
                        if (stderr)
                        {
                            this.eventStream.post(new DotnetAcquisitionScriptOutput(installKey, `STDERR: ${TelemetryUtilities.HashAllPaths(stderr)}`));
                        }

                        const online = await isOnline();
                        if (!online)
                        {
                            const offlineError = new Error('No internet connection: Cannot install .NET');
                            this.eventStream.post(new DotnetOfflineFailure(offlineError, installKey));
                            reject(offlineError);
                        }
                        else if (error.signal === 'SIGKILL') {
                            error.message = timeoutConstants.timeoutMessage;
                            this.eventStream.post(new DotnetAcquisitionTimeoutError(error, installKey, installContext.timeoutSeconds));
                            reject(error);
                        }
                        else
                        {
                            this.eventStream.post(new DotnetAcquisitionInstallError(error, installKey));
                            reject(error);
                        }
                    }
                    else if (stderr && stderr.length > 0)
                    {
                        this.eventStream.post(new DotnetAcquisitionScriptOutput(installKey, `STDERR: ${TelemetryUtilities.HashAllPaths(stderr)}`));
                        this.eventStream.post(new DotnetAcquisitionCompleted(installKey, installContext.dotnetPath, installContext.version));
                        resolve();
                    }
                    else
                    {
                        this.eventStream.post(new DotnetAcquisitionCompleted(installKey, installContext.dotnetPath, installContext.version));
                        resolve();
                    }
                });
            }
            catch (error)
            {
                this.eventStream.post(new DotnetAcquisitionUnexpectedError(error as Error, installKey));
                reject(error);
            }
        });
    }

    private async getInstallCommand(version: string, dotnetInstallDir: string, installRuntime: boolean, architecture: string): Promise<string> {
        const arch = this.fileUtilities.nodeArchToDotnetArch(architecture, this.eventStream);
        let args = [
            '-InstallDir', this.escapeFilePath(dotnetInstallDir),
            '-Version', version,
            '-Verbose'
        ];
        if (installRuntime)
        {
            args = args.concat('-Runtime', 'dotnet');
        }
        if(arch !== 'auto')
        {
            args = args.concat('-Architecture', arch);
        }

        const scriptPath = await this.scriptWorker.getDotnetInstallScriptPath();
        return `${ this.escapeFilePath(scriptPath) } ${ args.join(' ') }`;
    }

    private escapeFilePath(pathToEsc: string): string {
        if (os.platform() === 'win32')
        {
            // Need to escape apostrophes with two apostrophes
            const dotnetInstallDirEscaped = pathToEsc.replace(/'/g, `''`);
            // Surround with single quotes instead of double quotes (see https://github.com/dotnet/cli/issues/11521)
            return `'${dotnetInstallDirEscaped}'`;
        }
        else
        {
            return `"${pathToEsc}"`;
        }
    }

    /**
     *
     * @remarks Some users have reported not having powershell.exe or having execution policy that fails property evaluation functions in powershell install scripts.
     * We use this function to throw better errors if powershell is not configured correctly.
     */
    private async verifyPowershellCanRun(installContext : IDotnetInstallationContext) : Promise<string>
    {
        let knownError = false;
        let error = null;
        let command = null;

        const possibleCommands =
        [
            CommandExecutor.makeCommand(`powershell.exe`, []),
            CommandExecutor.makeCommand(`%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`, []),
            CommandExecutor.makeCommand(`pwsh`, []),
            CommandExecutor.makeCommand(`powershell`, []),
            CommandExecutor.makeCommand(`pwsh.exe`, [])
        ];

        try
        {
            // Check if PowerShell exists and is on the path.
            command = await new CommandExecutor(this.workerContext, this.utilityContext).tryFindWorkingCommand(possibleCommands);
            if(!command)
            {
                knownError = true;
                const err = Error(this.noPowershellError);
                error = err;
            }

            // Check Execution Policy
            const execPolicyOutput = cp.spawnSync(command!.commandRoot, [`-command`, `$ExecutionContext.SessionState.LanguageMode`], {cwd : path.resolve(__dirname), shell: true});
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

        return command!.commandRoot;
    }
}
