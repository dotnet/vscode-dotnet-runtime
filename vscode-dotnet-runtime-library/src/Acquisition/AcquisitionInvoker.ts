/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as cp from 'child_process';
import * as os from 'os';
import path = require('path');

/* eslint-disable */ // When editing this file, please remove this and fix the linting concerns.

import
{
    DotnetAcquisitionCompleted,
    DotnetAcquisitionInstallError,
    DotnetAcquisitionScriptError,
    DotnetAcquisitionScriptOutput,
    DotnetAcquisitionTimeoutError,
    DotnetAcquisitionUnexpectedError,
    DotnetOfflineFailure,
    EventBasedError,
    PowershellBadExecutionPolicy,
    PowershellBadLanguageMode,
} from '../EventStream/EventStreamEvents';

import { TelemetryUtilities } from '../EventStream/TelemetryUtilities';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { timeoutConstants } from '../Utils/ErrorHandler';
import { FileUtilities } from '../Utils/FileUtilities';
import { InstallScriptAcquisitionWorker } from './InstallScriptAcquisitionWorker';

import { IUtilityContext } from '../Utils/IUtilityContext';
import { getDotnetExecutable } from '../Utils/TypescriptUtilities';
import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { DotnetInstall } from './DotnetInstall';
import { DotnetInstallMode } from './DotnetInstallMode';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';
import { executeWithLock } from './LockUtilities';

export class AcquisitionInvoker extends IAcquisitionInvoker
{
    protected readonly scriptWorker: IInstallScriptAcquisitionWorker;
    protected fileUtilities: FileUtilities;
    private noPowershellError = `powershell.exe is not discoverable on your system. Is PowerShell added to your PATH and correctly installed? Please visit: https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows.
You will need to restart VS Code after these changes. If PowerShell is still not discoverable, try setting a custom existingDotnetPath following our instructions here: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md.`

    constructor(private readonly workerContext: IAcquisitionWorkerContext, private readonly utilityContext: IUtilityContext)
    {

        super(workerContext.eventStream);
        this.scriptWorker = new InstallScriptAcquisitionWorker(workerContext);
        this.fileUtilities = new FileUtilities();
    }

    public async installDotnet(installContext: IDotnetInstallationContext, install: DotnetInstall): Promise<void>
    {
        return executeWithLock(this.eventStream, false, installContext.installDir, async (installContext: IDotnetInstallationContext, install: DotnetInstall) =>
        {
            return new Promise<void>(async (resolve, reject) =>
            {
                try
                {
                    const winOS = os.platform() === 'win32';
                    const installCommand = await this.getInstallCommand(installContext.version, installContext.installDir, installContext.installMode, installContext.architecture);
                    let windowsFullCommand = `powershell.exe -NoProfile -NonInteractive -NoLogo -ExecutionPolicy bypass -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; & ${installCommand} }"`;
                    let powershellReference = 'powershell.exe';
                    if (winOS)
                    {
                        powershellReference = await this.verifyPowershellCanRun(installContext, install);
                        windowsFullCommand = windowsFullCommand.replace('powershell.exe', powershellReference);
                    }


                    // The install script can leave behind a directory in an invalid install state. Make sure the executable is present at the very least.
                    if (this.fileUtilities.existsSync(installContext.installDir) && !this.fileUtilities.existsSync(path.join(installContext.installDir, getDotnetExecutable())))
                    {
                        this.fileUtilities.wipeDirectory(installContext.installDir, this.eventStream);
                    }

                    cp.exec(winOS ? windowsFullCommand : installCommand,
                        { cwd: process.cwd(), maxBuffer: 500 * 1024, timeout: 1000 * installContext.timeoutSeconds, killSignal: 'SIGKILL' },
                        async (error, stdout, stderr) =>
                        {
                            if (stdout)
                            {
                                this.eventStream.post(new DotnetAcquisitionScriptOutput(install, TelemetryUtilities.HashAllPaths(stdout)));
                            }
                            if (stderr)
                            {
                                this.eventStream.post(new DotnetAcquisitionScriptOutput(install, `STDERR: ${TelemetryUtilities.HashAllPaths(stderr)}`));
                            }
                            if (this.looksLikeBadExecutionPolicyError(stderr))
                            {
                                const badPolicyError = new EventBasedError('PowershellBadExecutionPolicy', `Your powershell execution policy does not allow script execution, so we can't automate the installation.
Please read more at https://go.microsoft.com/fwlink/?LinkID=135170`);
                                this.eventStream.post(new PowershellBadExecutionPolicy(badPolicyError, install));
                                reject(badPolicyError);
                            }
                            if ((this.looksLikeBadLanguageModeError(stderr) || error?.code === 1) && this.badLanguageModeSet(powershellReference))
                            {
                                const badModeError = new EventBasedError('PowershellBadLanguageMode', `Your Language Mode disables PowerShell language features needed to install .NET. Read more at: https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_language_modes.
If you cannot change this flag, try setting a custom existingDotnetPath via the instructions here: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md.`);
                                this.eventStream.post(new PowershellBadLanguageMode(badModeError, install));
                                reject(badModeError);
                            }
                            if (error)
                            {
                                if (!(await WebRequestWorker.isOnline(installContext.timeoutSeconds, this.eventStream)))
                                {
                                    const offlineError = new EventBasedError('DotnetOfflineFailure', 'No internet connection detected: Cannot install .NET');
                                    this.eventStream.post(new DotnetOfflineFailure(offlineError, install));
                                    reject(offlineError);
                                }
                                else if (error.signal === 'SIGKILL')
                                {
                                    const newError = new EventBasedError('DotnetAcquisitionTimeoutError',
                                        `${timeoutConstants.timeoutMessage}, MESSAGE: ${error.message}, CODE: ${error.code}, KILLED: ${error.killed}`, error.stack);
                                    this.eventStream.post(new DotnetAcquisitionTimeoutError(error, install, installContext.timeoutSeconds));
                                    reject(newError);
                                }
                                else
                                {
                                    const newError = new EventBasedError('DotnetAcquisitionInstallError',
                                        `${timeoutConstants.timeoutMessage}, MESSAGE: ${error.message}, CODE: ${error.code}, SIGNAL: ${error.signal}`, error.stack);
                                    this.eventStream.post(new DotnetAcquisitionInstallError(newError, install));
                                    reject(newError);
                                }
                            }
                            else if (stderr && stderr.length > 0)
                            {
                                this.eventStream.post(new DotnetAcquisitionCompleted(install, installContext.dotnetPath, installContext.version));
                                resolve();
                            }
                            else
                            {
                                this.eventStream.post(new DotnetAcquisitionCompleted(install, installContext.dotnetPath, installContext.version));
                                resolve();
                            }
                        });
                }
                catch (error: any)
                {
                    // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const newError = new EventBasedError('DotnetAcquisitionUnexpectedError', error?.message, error?.stack)
                    this.eventStream.post(new DotnetAcquisitionUnexpectedError(newError, install));
                    reject(newError);
                }
            })
        }, installContext, install);
    }

    private looksLikeBadExecutionPolicyError(stderr: string): boolean
    {
        // tls12 is from the command output and gets truncated like so with this error
        // 135170 is the link id to the error, which may be subject to change but is a good language agnostic way to catch this
        // about_Execution_Policies this is a relatively language agnostic way to check as well
        return stderr.includes('+ ... ]::Tls12;') || stderr.includes('135170') || stderr.includes('about_Execution_Policies');
    }

    private looksLikeBadLanguageModeError(stderr: string): boolean
    {
        /*
This is one possible output of a failed command for this right now, but the install script might change so we account for multiple possibilities.

        Failed to resolve the exact version number.
At dotnet-install.ps1:1189 char:5
+     throw "Failed to resolve the exact version number."
+     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : OperationStopped: (Failed to resol...version number.:String) [], RuntimeException
    + FullyQualifiedErrorId : Failed to resolve the exact version number.
        */

        // Unexpected Token may also appear

        return stderr.includes('FullyQualifiedErrorId') || stderr.includes('unexpectedToken')
    }

    private badLanguageModeSet(powershellReference: string): boolean
    {
        if (os.platform() !== 'win32')
        {
            return false;
        }

        try
        {
            const languageModeOutput = cp.spawnSync(powershellReference, [`-command`, `$ExecutionContext.SessionState.LanguageMode`], { cwd: path.resolve(__dirname), shell: true });
            const languageMode = languageModeOutput.stdout.toString().trim();
            return (languageMode === 'ConstrainedLanguage' || languageMode === 'NoLanguage');
        }
        catch (e: any)
        {
            return true;
        }
    }

    private async getInstallCommand(version: string, dotnetInstallDir: string, installMode: DotnetInstallMode, architecture: string): Promise<string>
    {
        const arch = this.fileUtilities.nodeArchToDotnetArch(architecture, this.eventStream);
        let args = [
            '-InstallDir', this.escapeFilePath(dotnetInstallDir),
            '-Version', version,
            '-Verbose'
        ];
        if (installMode === 'runtime')
        {
            args = args.concat('-Runtime', 'dotnet');
        }
        else if (installMode === 'aspnetcore')
        {
            args = args.concat('-Runtime', 'aspnetcore');
        }
        if (arch !== 'auto')
        {
            args = args.concat('-Architecture', arch);
        }

        const scriptPath = await this.scriptWorker.getDotnetInstallScriptPath();
        return `${this.escapeFilePath(scriptPath)} ${args.join(' ')}`;
    }

    private escapeFilePath(pathToEsc: string): string
    {
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
    private async verifyPowershellCanRun(installContext: IDotnetInstallationContext, installId: DotnetInstall): Promise<string>
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
            if (!command)
            {
                knownError = true;
                const err = Error(this.noPowershellError);
                error = err;
            }
        }
        catch (err: any)
        {
            if (!knownError)
            {
                error = new Error(`${this.noPowershellError} More details: ${(err as Error).message}`);
            }
        }

        if (error != null)
        {
            this.eventStream.post(new DotnetAcquisitionScriptError(error as Error, installId));
            throw new EventBasedError('DotnetAcquisitionScriptError', error?.message, error?.stack);
        }

        return command!.commandRoot;
    }
}
