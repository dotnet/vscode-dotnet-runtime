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
    SuppressedAcquisitionError,
} from '../EventStream/EventStreamEvents';

import { TelemetryUtilities } from '../EventStream/TelemetryUtilities';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { timeoutConstants } from '../Utils/ErrorHandler';
import { FileUtilities } from '../Utils/FileUtilities';
import { InstallScriptAcquisitionWorker } from './InstallScriptAcquisitionWorker';

import { IUtilityContext } from '../Utils/IUtilityContext';
import { getDotnetExecutable } from '../Utils/TypescriptUtilities';
import { WebRequestWorkerSingleton } from '../Utils/WebRequestWorkerSingleton';
import { DotnetConditionValidator } from './DotnetConditionValidator';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { DotnetInstall } from './DotnetInstall';
import { DotnetInstallMode } from './DotnetInstallMode';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';

export class AcquisitionInvoker extends IAcquisitionInvoker
{
    protected readonly scriptWorker: IInstallScriptAcquisitionWorker;
    protected fileUtilities: FileUtilities;
    private noPowershellError = `powershell is not discoverable on your system. Is PowerShell added to your PATH and correctly installed? Please visit: https://aka.ms/install-powershell

You will need to restart VS Code after these changes. If PowerShell is still not discoverable, try setting a custom existingDotnetPath following our instructions here: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md.`

    constructor(private readonly workerContext: IAcquisitionWorkerContext, private readonly utilityContext: IUtilityContext)
    {

        super(workerContext.eventStream);
        this.scriptWorker = new InstallScriptAcquisitionWorker(workerContext);
        this.fileUtilities = new FileUtilities();
    }

    public async installDotnet(install: DotnetInstall): Promise<void>
    {
        const installDir = this.workerContext.installDirectoryProvider.getInstallDir(install.installId);
        const winOS = os.platform() === 'win32';
        const installCommand = await this.getInstallCommand(this.workerContext.acquisitionContext.version, installDir, this.workerContext.acquisitionContext.mode, this.workerContext.acquisitionContext.architecture);
        const dotnetPath = path.join(installDir, getDotnetExecutable());

        return new Promise<void>(async (resolve, reject) =>
        {
            try
            {
                let powershellReference = 'powershell.exe';
                let windowsFullCommand = `${powershellReference} -NoProfile -NonInteractive -NoLogo -ExecutionPolicy bypass -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; & ${installCommand} }"`;
                if (winOS)
                {
                    powershellReference = await this.verifyPowershellCanRun(install);
                    windowsFullCommand = windowsFullCommand.replace('powershell.exe', powershellReference);
                }

                // The install script can leave behind a directory in an invalid install state. Make sure the executable is present at the very least.
                if (await this.fileUtilities.exists(installDir))
                {
                    if (await this.fileUtilities.exists(dotnetPath))
                    {
                        const validator = new DotnetConditionValidator(this.workerContext, this.utilityContext);
                        const meetsRequirement = await validator.dotnetMeetsRequirement(dotnetPath, { acquireContext: this.workerContext.acquisitionContext, versionSpecRequirement: 'equal' });
                        if (meetsRequirement)
                        {
                            this.eventStream.post(new DotnetAcquisitionCompleted(install, dotnetPath, this.workerContext.acquisitionContext.version));
                            return resolve();
                        }
                    }

                    try
                    {
                        await this.fileUtilities.wipeDirectory(installDir, this.eventStream, undefined, true);
                    }
                    catch (err: any)
                    {
                        this.eventStream.post(new SuppressedAcquisitionError(err, `${installDir} could not be not removed, and it has a corrupted install. Please remove it manually.`));
                    }
                }

                cp.exec(winOS ? windowsFullCommand : installCommand,
                    { cwd: process.cwd(), maxBuffer: 500 * 1024, timeout: 1000 * this.workerContext.timeoutSeconds, killSignal: 'SIGKILL' },
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
                        if ((this.looksLikeBadLanguageModeError(stderr) || error?.code === 1) && await this.badLanguageModeSet(powershellReference))
                        {
                            const badModeError = new EventBasedError('PowershellBadLanguageMode', `Your Language Mode disables PowerShell language features needed to install .NET. Read more at: https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_language_modes.
If you cannot change this flag, try setting a custom existingDotnetPath via the instructions here: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md.`);
                            this.eventStream.post(new PowershellBadLanguageMode(badModeError, install));
                            reject(badModeError);
                        }
                        if (error)
                        {
                            if (!(await WebRequestWorkerSingleton.getInstance().isOnline(this.workerContext.timeoutSeconds, this.eventStream)))
                            {
                                const offlineError = new EventBasedError('DotnetOfflineFailure', 'No internet connection detected: Cannot install .NET');
                                this.eventStream.post(new DotnetOfflineFailure(offlineError, install));
                                reject(offlineError);
                            }
                            else if (error.signal === 'SIGKILL')
                            {
                                const newError = new EventBasedError('DotnetAcquisitionTimeoutError',
                                    `${timeoutConstants.timeoutMessage}, MESSAGE: ${error.message}, CODE: ${error.code}, KILLED: ${error.killed}`, error.stack);
                                this.eventStream.post(new DotnetAcquisitionTimeoutError(error, install, this.workerContext.timeoutSeconds));
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
                        else if ((stderr?.length ?? 0) > 0)
                        {
                            this.eventStream.post(new DotnetAcquisitionCompleted(install, dotnetPath, this.workerContext.acquisitionContext.version));
                            resolve();
                        }
                        else
                        {
                            this.eventStream.post(new DotnetAcquisitionCompleted(install, dotnetPath, this.workerContext.acquisitionContext.version));
                            resolve();
                        }
                    });
            }
            catch (error: any)
            {
                // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const newError = new EventBasedError('DotnetAcquisitionUnexpectedError', error?.message, error?.stack);
                this.eventStream.post(new DotnetAcquisitionUnexpectedError(newError, install));
                reject(newError);
            }
        });
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

    private async badLanguageModeSet(powershellReference: string): Promise<boolean>
    {
        if (os.platform() !== 'win32')
        {
            return false;
        }

        try
        {
            const checkLanguageModeCmd = CommandExecutor.makeCommand(powershellReference, [`-command`, `$ExecutionContext.SessionState.LanguageMode`]);
            const languageModeOutput = await new CommandExecutor(this.workerContext, this.utilityContext).execute(checkLanguageModeCmd, { cwd: path.resolve(__dirname), shell: true });
            const languageMode = languageModeOutput.stdout.trim();
            return (languageMode === 'ConstrainedLanguage' || languageMode === 'NoLanguage');
        }
        catch (e: any)
        {
            return true;
        }
    }

    private async getInstallCommand(version: string, dotnetInstallDir: string, installMode?: DotnetInstallMode, architecture?: string | null): Promise<string>
    {
        const arch = this.fileUtilities.nodeArchToDotnetArch(architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture(), this.eventStream);
        let args = [
            '-InstallDir', this.escapeFilePath(dotnetInstallDir),
            '-Version', version,
            '-Verbose'
        ];
        if (installMode === 'runtime' || !installMode)
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
    private async verifyPowershellCanRun(installId: DotnetInstall): Promise<string>
    {
        let knownError = false;
        let error = null;
        let command = null;

        const possibleCommands = // create a bunch of commands that just return the index of the correct shell in powershell
            [
                CommandExecutor.makeCommand('0', []),
                CommandExecutor.makeCommand('1', []),
                CommandExecutor.makeCommand('2', []),
                CommandExecutor.makeCommand('3', []),
                CommandExecutor.makeCommand('4', []),
            ];
        const possiblePowershellPaths =
            [ // use shell as powershell and see if it passes or not. This is faster than doing it with the default shell, as that spawns a cmd to spawn a pwsh
                { shell: `powershell.exe` },
                { shell: `%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` },
                { shell: `pwsh` },
                { shell: `powershell` }
            ]
        try
        {
            // Check if PowerShell exists and is on the path.
            command = await new CommandExecutor(this.workerContext, this.utilityContext).tryFindWorkingCommand(possibleCommands, possiblePowershellPaths);
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

        return possiblePowershellPaths.at(Number(command!.commandRoot))?.shell ?? 'powershell.exe';
    }
}
