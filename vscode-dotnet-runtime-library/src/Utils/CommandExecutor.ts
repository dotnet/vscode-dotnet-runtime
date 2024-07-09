/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as proc from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import open = require('open');
import path = require('path');

import {
    EventCancellationError,
    CommandExecutionEvent,
    CommandExecutionNoStatusCodeWarning,
    CommandExecutionNonZeroExitFailure,
    CommandExecutionSignalSentEvent,
    CommandExecutionStatusEvent,
    CommandExecutionStdError,
    CommandExecutionStdOut,
    CommandExecutionUnderSudoEvent,
    CommandExecutionUnknownCommandExecutionAttempt,
    CommandExecutionUserAskDialogueEvent,
    CommandExecutionUserCompletedDialogueEvent,
    CommandExecutionUserRejectedPasswordRequest,
    CommandProcessesExecutionFailureNonTerminal,
    CommandProcessorExecutionBegin,
    CommandProcessorExecutionEnd,
    DotnetAlternativeCommandFoundEvent,
    DotnetCommandNotFoundEvent,
    DotnetLockAcquiredEvent,
    DotnetLockReleasedEvent,
    DotnetWSLSecurityError,
    SudoProcAliveCheckBegin,
    SudoProcAliveCheckEnd,
    SudoProcCommandExchangeBegin,
    SudoProcCommandExchangeEnd,
    SudoProcCommandExchangePing,
    TimeoutSudoCommandExecutionError,
    TimeoutSudoProcessSpawnerError,
    EventBasedError
} from '../EventStream/EventStreamEvents';
import {exec} from '@vscode/sudo-prompt';
import * as lockfile from 'proper-lockfile';
import { CommandExecutorCommand } from './CommandExecutorCommand';
import { getInstallFromContext } from './InstallKeyUtilities';


import { ICommandExecutor } from './ICommandExecutor';
import { IUtilityContext } from './IUtilityContext';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { FileUtilities } from './FileUtilities';
import { IFileUtilities } from './IFileUtilities';
import { CommandExecutorResult } from './CommandExecutorResult';
import { isRunningUnderWSL, loopWithTimeoutOnCond } from './TypescriptUtilities';

/* tslint:disable:no-any */
/* tslint:disable:no-string-literal */

export class CommandExecutor extends ICommandExecutor
{
    private pathTroubleshootingOption = 'Troubleshoot';
    private sudoProcessCommunicationDir = path.join(__dirname, 'install scripts');
    private fileUtil : IFileUtilities;
    private hasEverLaunchedSudoFork = false;

    constructor(context : IAcquisitionWorkerContext, utilContext : IUtilityContext,  protected readonly validSudoCommands? : string[])
    {
        super(context, utilContext);
        this.fileUtil = new FileUtilities();
    }

    /**
     *
     * @returns The output of the command.
     */
    private async ExecSudoAsync(command : CommandExecutorCommand, terminalFailure = true) : Promise<CommandExecutorResult>
    {
        const fullCommandString = CommandExecutor.prettifyCommandExecutorCommand(command, false);
        this.context?.eventStream.post(new CommandExecutionUnderSudoEvent(`The command ${fullCommandString} is being ran under sudo.`));
        const shellScript = path.join(this.sudoProcessCommunicationDir, 'interprocess-communicator.sh');

        if(isRunningUnderWSL(this.context?.eventStream))
        {
            // For WSL, vscode/sudo-prompt does not work.
            // This is because it relies on pkexec or a GUI app to popup and request sudo privilege.
            // GUI in WSL is not supported, so it will fail.
            // We had a working implementation that opens a vscode box and gets the user password, but that will require more security analysis.

            const err = new DotnetWSLSecurityError(new EventCancellationError('DotnetWSLSecurityError',
            `Automatic .NET SDK Installation is not yet supported in WSL due to VS Code & WSL limitations.
Please install the .NET SDK manually by following https://learn.microsoft.com/en-us/dotnet/core/install/linux-ubuntu. Then, add it to the path by following https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#manually-installing-net`,
                ), getInstallFromContext(this.context));
            this.context?.eventStream.post(err);
            throw err.error;
        }

        const masterSudoProcessSpawnResult = this.startupSudoProc(fullCommandString, shellScript, terminalFailure);

        await this.sudoProcIsLive(terminalFailure);
        return this.executeSudoViaProcessCommunication(fullCommandString, terminalFailure);
    }

    /**
     *
     * @param fullCommandString the command that will be run by the master process once it is spawned, not super relevant here, used for logging.
     * @param shellScriptPath the path of the shell script file for the process to run that should loop and follow the protocol procedure
     * @param terminalFailure whether if we cannot start the sudo process, should we fail the entire program.
     * @returns The string result of either trying to spawn the sudo master process, or the status code of that attempt depending on the return mode.
     */
    private async startupSudoProc(fullCommandString : string, shellScriptPath : string, terminalFailure : boolean) : Promise<string>
    {
        if(this.hasEverLaunchedSudoFork)
        {
            if(await this.sudoProcIsLive(false))
            {
                return Promise.resolve('0');
            }
        }
        this.hasEverLaunchedSudoFork = true;

        // Launch the process under sudo
        this.context?.eventStream.post(new CommandExecutionUserAskDialogueEvent(`Prompting user for command ${fullCommandString} under sudo.`));

        // The '.' character is not allowed for sudo-prompt so we use 'NET'
        let sanitizedCallerName = this.context?.acquisitionContext?.requestingExtensionId?.replace(/[^0-9a-z]/gi, ''); // Remove non-alphanumerics per OS requirements
        sanitizedCallerName = sanitizedCallerName?.substring(0, 69); // 70 Characters is the maximum limit we can use for the prompt.
        const options = { name: `${sanitizedCallerName ?? 'NET Install Tool'}` };

        fs.chmodSync(shellScriptPath, 0o500);
        const timeoutSeconds = Math.max(100, this.context.timeoutSeconds);
        exec((`"${shellScriptPath}" "${this.sudoProcessCommunicationDir}" "${timeoutSeconds}" ${this.validSudoCommands?.join(' ')} &`), options, (error?: any, stdout?: any, stderr?: any) =>
        {
                this.context?.eventStream.post(new CommandExecutionStdOut(`The process spawn: ${fullCommandString} encountered stdout, continuing
${stdout}`));

                this.context?.eventStream.post(new CommandExecutionStdError(`The process spawn: ${fullCommandString} encountered stderr, continuing
${stderr}`));

            if (error)
            {
                this.context?.eventStream.post(new CommandExecutionUserCompletedDialogueEvent(`The process spawn: ${fullCommandString} failed to run under sudo.`));
                if(terminalFailure)
                {
                    if(error.code === 126)
                    {
                        const cancelledErr = new CommandExecutionUserRejectedPasswordRequest(new EventCancellationError('CommandExecutionUserRejectedPasswordRequest',
                        `Cancelling .NET Install, as command ${fullCommandString} failed.
The user refused the password prompt.`),
                            getInstallFromContext(this.context));
                        this.context?.eventStream.post(cancelledErr);
                        return Promise.reject(cancelledErr.error);
                    }
                    else if(error.code === 111777)
                    {
                        const securityErr = new CommandExecutionUnknownCommandExecutionAttempt(new EventCancellationError('CommandExecutionUnknownCommandExecutionAttempt',
                        `Cancelling .NET Install, as command ${fullCommandString} is UNKNOWN.
Please report this at https://github.com/dotnet/vscode-dotnet-runtime/issues.`),
                            getInstallFromContext(this.context));
                        this.context?.eventStream.post(securityErr);
                        return Promise.reject(securityErr.error);
                    }
                    return Promise.reject(error);
                }
                else
                {
                    return Promise.resolve('1');
                }
            }
            else
            {
                this.context?.eventStream.post(new CommandExecutionUserCompletedDialogueEvent(`The process spawn: ${fullCommandString} successfully ran under sudo.`));
                return Promise.resolve('0');
            }
        });

        return Promise.resolve('0');
    }

    /**
     *
     * @param errorIfDead set this to true if we should terminally fail if the master process is not yet alive
     * @returns a boolean, true if the master process is live, false otherwise
     */
    private async sudoProcIsLive(errorIfDead : boolean) : Promise<boolean>
    {
        let isLive = false;

        const processAliveOkSentinelFile = path.join(this.sudoProcessCommunicationDir, 'ok.txt');
        const fakeLockFile = path.join(this.sudoProcessCommunicationDir, 'fakeLockFile'); // We need a file to lock the directory in the API besides the dir lock file

        await this.fileUtil.writeFileOntoDisk('', fakeLockFile, false, this.context?.eventStream!);

        // Prepare to lock directory
        const directoryLock = 'dir.lock';
        const directoryLockPath = path.join(path.dirname(processAliveOkSentinelFile), directoryLock);

        // Lock the directory -- this is not a system wide lock, only a library lock we must respect in the code.
        // This will allow the process to still edit the directory, but not our extension API calls from overlapping with one another.
        await lockfile.lock(fakeLockFile, { lockfilePath: directoryLockPath, retries: { retries: 10, minTimeout: 5, maxTimeout: 10000 } } )
        .then(async (release: () => void) =>
        {
            this.context?.eventStream.post(new DotnetLockAcquiredEvent(`Lock Acquired.`, new Date().toISOString(), directoryLockPath, fakeLockFile));

            await this.fileUtil.wipeDirectory(this.sudoProcessCommunicationDir, this.context?.eventStream, ['.txt']);

            await this.fileUtil.writeFileOntoDisk('', processAliveOkSentinelFile, true, this.context?.eventStream);
            this.context?.eventStream.post(new SudoProcAliveCheckBegin(`Looking for Sudo Process Master, wrote OK file. ${new Date().toISOString()}`));

            const waitTime = this.context?.timeoutSeconds ? ((this.context?.timeoutSeconds/3) * 1000) : 180000;
            await loopWithTimeoutOnCond(100, waitTime,
                function processRespondedByDeletingOkFile() : boolean { return !fs.existsSync(processAliveOkSentinelFile) },
                function setProcessIsAlive() : void { isLive = true; },
                this.context.eventStream,
                new SudoProcCommandExchangePing(`Ping : Waiting. ${new Date().toISOString()}`)
            )
            .catch(error =>
            {
                // Let the rejected promise get handled below
            });


            this.context?.eventStream.post(new DotnetLockReleasedEvent(`Lock about to be released.`, new Date().toISOString(), directoryLockPath, fakeLockFile));
            return release();
        });

        this.context?.eventStream.post(new SudoProcAliveCheckEnd(`Finished Sudo Process Master: Is Alive? ${isLive}. ${new Date().toISOString()}`));

        if(!isLive && errorIfDead)
        {
            const err = new TimeoutSudoProcessSpawnerError(new EventCancellationError('TimeoutSudoProcessSpawnerError', `We are unable to spawn the process to run commands under sudo for installing .NET.
Process Directory: ${this.sudoProcessCommunicationDir} failed with error mode: ${errorIfDead}.
It had previously spawned: ${this.hasEverLaunchedSudoFork}.`), getInstallFromContext(this.context));
            this.context?.eventStream.post(err);
            throw err.error;
        }

        return isLive;
    }

    /**
     *
     * @param commandToExecuteString The command to tell the sudo'd master process to execute. It must be live.
     * @param terminalFailure Whether to fail if we never get a response from the sudo process.
     * @param failOnNonZeroExit Whether to fail if we get an exit code from the command besides 0.
     * @returns The output string of the command, or the string status code, depending on the mode of execution.
     */
    private async executeSudoViaProcessCommunication(commandToExecuteString : string, terminalFailure : boolean, failOnNonZeroExit = true) : Promise<CommandExecutorResult>
    {
        let commandOutputJson : CommandExecutorResult | null = null;
        const noStatusCodeErrorCode = '1220'; // Special failure code for if code is never set error

        const commandFile = path.join(this.sudoProcessCommunicationDir, 'command.txt');
        const stderrFile = path.join(this.sudoProcessCommunicationDir, 'stderr.txt');
        const stdoutFile = path.join(this.sudoProcessCommunicationDir, 'stdout.txt');
        const statusFile = path.join(this.sudoProcessCommunicationDir, 'status.txt');

        const outputFile = path.join(this.sudoProcessCommunicationDir, 'output.txt');
        const fakeLockFile = path.join(this.sudoProcessCommunicationDir, 'fakeLockFile'); // We need a file to lock the directory in the API besides the dir lock file

        await this.fileUtil.writeFileOntoDisk('', fakeLockFile, false, this.context?.eventStream!);

        // Prepare to lock directory
        const directoryLock = 'dir.lock';
        const directoryLockPath = path.join(path.dirname(commandFile), directoryLock);

        // Lock the directory -- this is not a system wide lock, only a library lock we must respect in the code.
        // This will allow the process to still edit the directory, but not our extension API calls from overlapping with one another.


        await lockfile.lock(fakeLockFile, { lockfilePath: directoryLockPath, retries: { retries: 10, minTimeout : 5, maxTimeout: 10000 } } )
        .then(async (release: () => any) =>
        {
            this.context?.eventStream.post(new DotnetLockAcquiredEvent(`Lock Acquired.`, new Date().toISOString(), directoryLockPath, fakeLockFile));
            await this.fileUtil.wipeDirectory(this.sudoProcessCommunicationDir, this.context?.eventStream, ['.txt', '.json']);

            await this.fileUtil.writeFileOntoDisk(`${commandToExecuteString}`, commandFile, true, this.context?.eventStream!);
            this.context?.eventStream.post(new SudoProcCommandExchangeBegin(`Handing command off to master process. ${new Date().toISOString()}`));
            this.context?.eventStream.post(new CommandProcessorExecutionBegin(`The command ${commandToExecuteString} was forwarded to the master process to run.`));


            const waitTime = this.context?.timeoutSeconds ? (this.context?.timeoutSeconds * 1000) : 600000;
            await loopWithTimeoutOnCond(100, waitTime,
                function ProcessFinishedExecutingAndWroteOutput() : boolean { return fs.existsSync(outputFile) },
                function doNothing() : void { ; },
                this.context.eventStream,
                new SudoProcCommandExchangePing(`Ping : Waiting. ${new Date().toISOString()}`)
            )
            .catch(error =>
            {
                // Let the rejected promise get handled below
            });

            commandOutputJson = {
                stdout : (fs.readFileSync(stdoutFile, 'utf8')).trim(),
                stderr : (fs.readFileSync(stderrFile, 'utf8')).trim(),
                status : (fs.readFileSync(statusFile, 'utf8')).trim()
            } as CommandExecutorResult;
            this.context?.eventStream.post(new DotnetLockReleasedEvent(`Lock about to be released.`, new Date().toISOString(), directoryLockPath, fakeLockFile));
            await this.fileUtil.wipeDirectory(this.sudoProcessCommunicationDir, this.context?.eventStream, ['.txt']);

            return release();
        });

        this.context?.eventStream.post(new SudoProcCommandExchangeEnd(`Finished or timed out with master process. ${new Date().toISOString()}`));

        if(!commandOutputJson && terminalFailure)
        {
            const err = new TimeoutSudoCommandExecutionError(new EventCancellationError('TimeoutSudoCommandExecutionError',
            `Timeout: The master process with command ${commandToExecuteString} never finished executing.
Process Directory: ${this.sudoProcessCommunicationDir} failed with error mode: ${terminalFailure}.
It had previously spawned: ${this.hasEverLaunchedSudoFork}.`), getInstallFromContext(this.context));
            this.context?.eventStream.post(err);
            throw err.error;
        }
        else if(!commandOutputJson)
        {
            this.context?.eventStream.post(new CommandProcessesExecutionFailureNonTerminal(`The command ${commandToExecuteString} never finished under the process, but it was marked non terminal.`));
        }
        else
        {
            this.context?.eventStream.post(new CommandProcessorExecutionEnd(`The command ${commandToExecuteString} was finished by the master process, as ${outputFile} was found.`));

            this.context?.eventStream.post(new CommandExecutionStdOut(`The command ${commandToExecuteString} encountered stdout, continuing
${(commandOutputJson as CommandExecutorResult).stdout}`));

            this.context?.eventStream.post(new CommandExecutionStdError(`The command ${commandToExecuteString} encountered stderr, continuing
${(commandOutputJson as CommandExecutorResult).stderr}`));

            if((commandOutputJson as CommandExecutorResult).status !== '0' && failOnNonZeroExit)
            {
                const err = new CommandExecutionNonZeroExitFailure(new EventBasedError('CommandExecutionNonZeroExitFailure',
                    `Cancelling .NET Install, as command ${commandToExecuteString} returned with status ${(commandOutputJson as CommandExecutorResult).status}.
${(commandOutputJson as CommandExecutorResult).stderr}.`),
                     getInstallFromContext(this.context));
                this.context?.eventStream.post(err);
                throw err.error;
            }
        }

        return commandOutputJson ?? { stdout: '', stderr : '', status: noStatusCodeErrorCode};
    }

    public async executeMultipleCommands(commands: CommandExecutorCommand[], options?: any, terminalFailure = true): Promise<CommandExecutorResult[]>
    {
        const results = [];
        for(const command of commands)
        {
            results.push(await this.execute(command, options, terminalFailure));
        }

        return results;
    }

    /**
     *
     * @param workingDirectory The directory to execute in. Only works for non sudo commands.
     * @param terminalFailure Whether to throw up an error when executing under sudo or suppress it and return stderr
     * @returns the result(s) of each command. Can throw generically if the command fails.
     */
    public async execute(command : CommandExecutorCommand, options : any | null = null, terminalFailure = true) : Promise<CommandExecutorResult>
    {
        const fullCommandStringForTelemetryOnly = `${command.commandRoot} ${command.commandParts.join(' ')}`;
        if(options && !options?.cwd)
        {
            options.cwd = path.resolve(__dirname);
        }
        if(options && !options?.shell)
        {
            options.shell = true;
        }
        if(!options)
        {
            options = {cwd : path.resolve(__dirname), shell: true};
        }

        if(command.runUnderSudo)
        {
            return this.ExecSudoAsync(command, terminalFailure);
        }
        else
        {
            this.context?.eventStream.post(new CommandExecutionEvent(`Executing command ${fullCommandStringForTelemetryOnly}
with options ${JSON.stringify(options)}.`));
            const commandResult = proc.spawnSync(command.commandRoot, command.commandParts, options);

            if(os.platform() === 'win32')
            {
                proc.spawn('taskkill', ['/pid', commandResult.pid.toString(), '/f', '/t']);
            }


            this.logCommandResult(commandResult, fullCommandStringForTelemetryOnly);

            const statusCode : string = (() =>
            {
                if(commandResult.status !== null)
                {
                    return commandResult.status.toString() ?? '';
                }
                else
                {
                    // A signal is generally given if a status is not given, and they are 'equivalent' enough
                    if(commandResult.signal !== null)
                    {

                        return commandResult.signal.toString() ?? '';
                    }
                    else
                    {
                        this.context?.eventStream.post(new CommandExecutionNoStatusCodeWarning(`The command ${fullCommandStringForTelemetryOnly} with
result: ${commandResult.toString()} had no status or signal.`));
                        return '000751'; // Error code 000751 : The command did not report an exit code upon completion. This is never expected
                    }
                }
            })();

            return { status: statusCode, stderr: commandResult.stderr?.toString() ?? '', stdout: commandResult.stdout?.toString() ?? ''}
        }
    }

    private logCommandResult(commandResult : any, fullCommandStringForTelemetryOnly : string)
    {
        this.context?.eventStream.post(new CommandExecutionStatusEvent(`The command ${fullCommandStringForTelemetryOnly} exited
        with status: ${commandResult.status?.toString()}.`));

        this.context?.eventStream.post(new CommandExecutionSignalSentEvent(`The command ${fullCommandStringForTelemetryOnly} exited
with signal: ${commandResult.signal?.toString()}.`));

        this.context?.eventStream.post(new CommandExecutionStdOut(`The command ${fullCommandStringForTelemetryOnly} encountered stdout:
${commandResult.stdout}`));

        this.context?.eventStream.post(new CommandExecutionStdError(`The command ${fullCommandStringForTelemetryOnly} encountered stderr:
${commandResult.stderr}`));
    }

    /**
     *
     * @param commandRoots The first word of each command to try
     * @param matchingCommandParts Any follow up words in that command to execute, matching in the same order as commandRoots
     * @returns the index of the working command you provided, if no command works, -1.
     */
    public async tryFindWorkingCommand(commands : CommandExecutorCommand[]) : Promise<CommandExecutorCommand | null>
    {
        let workingCommand : CommandExecutorCommand | null = null;

        for(const command of commands)
        {
            try
            {
                const cmdFoundOutput = (await this.execute(command)).status;
                if(cmdFoundOutput === '0')
                {
                    workingCommand = command;
                    this.context?.eventStream.post(new DotnetAlternativeCommandFoundEvent(`The command ${command.commandRoot} was found.`));
                    break;
                }
                else
                {
                    this.context?.eventStream.post(new DotnetCommandNotFoundEvent(`The command ${command.commandRoot} was NOT found, no error was thrown.`));
                }
            }
            catch(err)
            {
                // Do nothing. The error should be raised higher up.
                this.context?.eventStream.post(new DotnetCommandNotFoundEvent(`The command ${command.commandRoot} was NOT found, and we caught any errors.`));
            }
        }

        return workingCommand;
    }

    public async setEnvironmentVariable(variable : string, value : string, vscodeContext : IVSCodeExtensionContext, failureWarningMessage? : string, nonWinFailureMessage? : string)
    {
        let environmentEditExitCode = 0;

        process.env[variable] = value;
        vscodeContext.setVSCodeEnvironmentVariable(variable, value);

        if(os.platform() === 'win32')
        {
            const setShellVariable = CommandExecutor.makeCommand(`set`, [`${variable}=${value}`]);
            const setSystemVariable = CommandExecutor.makeCommand(`setx`, [`${variable}`, `"${value}"`]);
            try
            {
                const shellEditResponse = (await this.execute(setShellVariable)).status;
                environmentEditExitCode += Number(shellEditResponse[0]);
                const systemEditResponse = (await this.execute(setSystemVariable)).status
                environmentEditExitCode += Number(systemEditResponse[0]);
            }
            catch(error)
            {
                environmentEditExitCode = 1
            }
        }
        else
        {
            // export var=value does not do anything, because on osx and linux processes cannot edit above proc variables.
            // We could try to edit etc/environment on ubuntu, then .profile/.bash_rc/.zsh etc on osx, but we'd like to avoid being intrusive.
            failureWarningMessage = nonWinFailureMessage ? failureWarningMessage : nonWinFailureMessage;
            environmentEditExitCode = 1;
        }

        if(environmentEditExitCode !== 0 && failureWarningMessage)
        {
            this.utilityContext.ui.showWarningMessage(failureWarningMessage, () => {/* No Callback */}, );
        }
    }

    public setPathEnvVar(pathAddition: string, troubleshootingUrl : string, displayWorker: IWindowDisplayWorker, vscodeContext : IVSCodeExtensionContext, isGlobal : boolean)
    {
        if(!isGlobal || os.platform() === 'linux')
        {
            // Set user PATH variable. The .NET SDK Installer does this for us on Win/Mac.
            let pathCommand: string | undefined;
            if (os.platform() === 'win32') {
                pathCommand = this.getWindowsPathCommand(pathAddition);
            } else {
                pathCommand = this.getLinuxPathCommand(pathAddition);
            }

            if (pathCommand !== undefined) {
                this.runPathCommand(pathCommand, troubleshootingUrl, displayWorker);
            }
        }

        // Set PATH for VSCode terminal instances
        if (!process.env.PATH!.includes(pathAddition)) {
            vscodeContext.appendToEnvironmentVariable('PATH', path.delimiter + pathAddition);
            process.env.PATH += path.delimiter + pathAddition;
        }
    }

    protected getLinuxPathCommand(pathAddition: string): string | undefined
    {
        const profileFile = os.platform() === 'darwin' ? path.join(os.homedir(), '.zshrc') : path.join(os.homedir(), '.profile');
        if (fs.existsSync(profileFile) && fs.readFileSync(profileFile).toString().includes(pathAddition)) {
            // No need to add to PATH again
            return undefined;
        }
        return `echo 'export PATH="${pathAddition}:$PATH"' >> ${profileFile}`;
    }

    protected getWindowsPathCommand(pathAddition: string): string | undefined
    {
        if (process.env.PATH && process.env.PATH.includes(pathAddition)) {
            // No need to add to PATH again
            return undefined;
        }
        return `for /F "skip=2 tokens=1,2*" %A in ('%SystemRoot%\\System32\\reg.exe query "HKCU\\Environment" /v "Path" 2^>nul') do ` +
            `(%SystemRoot%\\System32\\reg.exe ADD "HKCU\\Environment" /v Path /t REG_SZ /f /d "${pathAddition};%C")`;
    }

    protected runPathCommand(pathCommand: string, troubleshootingUrl : string, displayWorker: IWindowDisplayWorker)
    {
        try {
            proc.execSync(pathCommand);
        } catch (error) {
            displayWorker.showWarningMessage(`Unable to add SDK to the PATH: ${error}`,
                async (response: string | undefined) => {
                    if (response === this.pathTroubleshootingOption) {
                        open(`${troubleshootingUrl}#unable-to-add-to-path`);
                    }
                }, this.pathTroubleshootingOption);
        }
    }
}
