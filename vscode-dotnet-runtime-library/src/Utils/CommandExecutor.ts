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
    CommandExecutionEvent,
    CommandExecutionNoStatusCodeWarning,
    CommandExecutionSignalSentEvent,
    CommandExecutionStatusEvent,
    CommandExecutionStdError,
    CommandExecutionStdOut,
    CommandExecutionUnderSudoEvent,
    CommandExecutionUserCompletedDialogueEvent,
    DotnetAlternativeCommandFoundEvent,
    DotnetCommandNotFoundEvent,
    DotnetWSLSecurityError
} from '../EventStream/EventStreamEvents';
import {exec} from '@vscode/sudo-prompt';

import { CommandExecutorCommand } from './CommandExecutorCommand';
import { getInstallKeyFromContext } from '../Utils/InstallKeyGenerator';


import { ICommandExecutor } from './ICommandExecutor';
import { IUtilityContext } from './IUtilityContext';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';

/* tslint:disable:no-any */

export class CommandExecutor extends ICommandExecutor
{
    private pathTroubleshootingOption = 'Troubleshoot';

    constructor(context : IAcquisitionWorkerContext, utilContext : IUtilityContext)
    {
        super(context, utilContext);
    }

    /**
     * Returns true if the linux agent is running under WSL, else false.
     */
    private isRunningUnderWSL() : boolean
    {
        // See https://github.com/microsoft/WSL/issues/4071 for evidence that we can rely on this behavior.

        const command = 'grep';
        const args = ['-i', 'Microsoft', '/proc/version'];
        const commandResult = proc.spawnSync(command, args);

        return commandResult.stdout.toString() !== '';
    }

    /**
     *
     * @returns The output of the command.
     */
    private async ExecSudoAsync(command : CommandExecutorCommand, terminalFailure = true) : Promise<string>
    {
        const fullCommandString = CommandExecutor.prettifyCommandExecutorCommand(command, false);
        this.context.eventStream.post(new CommandExecutionUnderSudoEvent(`The command ${fullCommandString} is being ran under sudo.`));

        if(this.isRunningUnderWSL())
        {
            // For WSL, vscode/sudo-prompt does not work.
            // This is because it relies on pkexec or a GUI app to popup and request sudo privilege.
            // GUI in WSL is not supported, so it will fail.
            // We had a working implementation that opens a vscode box and gets the user password, but that will require more security analysis.

            const err = new DotnetWSLSecurityError(new Error(`Automatic .NET SDK Installation is not yet supported in WSL due to VS Code & WSL limitations.
Please install the .NET SDK manually by following https://learn.microsoft.com/en-us/dotnet/core/install/linux-ubuntu. Then, add it to the path by following https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#manually-installing-net`,
                ), getInstallKeyFromContext(this.context.acquisitionContext!));
            this.context.eventStream.post(err);
            throw err.error;
        }

        // We wrap the exec in a promise because there is no synchronous version of the sudo exec command for vscode/sudo
        return new Promise<string>((resolve, reject) =>
        {
            // The '.' character is not allowed for sudo-prompt so we use 'NET'
            const options = { name: `${this.context.acquisitionContext?.requestingExtensionId} On behalf of NET Install Tool` };
            exec((fullCommandString), options, (error?: any, stdout?: any, stderr?: any) =>
            {
                let commandResultString = '';

                if (stdout)
                {
                    this.context.eventStream.post(new CommandExecutionStdOut(`The command ${fullCommandString} encountered stdout, continuing
${stdout}`));
                    commandResultString += stdout;
                }
                if (stderr)
                {
                    this.context.eventStream.post(new CommandExecutionStdError(`The command ${fullCommandString} encountered stderr, continuing
${stderr}`));
                    commandResultString += stderr;
                }

                if (error)
                {
                    this.context.eventStream.post(new CommandExecutionUserCompletedDialogueEvent(`The command ${fullCommandString} failed to run under sudo.`));
                    if(terminalFailure)
                    {
                        reject(error);
                    }
                    else
                    {
                        resolve(this.returnStatus ? '1' : stderr);
                    }
                }
                else
                {
                    this.context.eventStream.post(new CommandExecutionUserCompletedDialogueEvent(`The command ${fullCommandString} successfully ran under sudo.`));
                    resolve(this.returnStatus ? '0' : commandResultString);
                }
            });
        });
    }

    public async executeMultipleCommands(commands: CommandExecutorCommand[], options?: any, terminalFailure = true): Promise<string[]> {
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
    public async execute(command : CommandExecutorCommand, options : any | null = null, terminalFailure = true) : Promise<string>
    {
        const fullCommandStringForTelemetryOnly = `${command.commandRoot} ${command.commandParts.join(' ')}`;
        if(!options)
        {
            options = {cwd : path.resolve(__dirname), shell: true};
        }

        if(command.runUnderSudo)
        {
            return this.ExecSudoAsync(command, terminalFailure) ?? '';
        }
        else
        {
            this.context.eventStream.post(new CommandExecutionEvent(`Executing command ${fullCommandStringForTelemetryOnly}
with options ${options}.`));
            const commandResult = proc.spawnSync(command.commandRoot, command.commandParts, options);
            if(this.returnStatus)
            {
                if(commandResult.status !== null)
                {
                    this.context.eventStream.post(new CommandExecutionStatusEvent(`The command ${fullCommandStringForTelemetryOnly} exited
with status: ${commandResult.status.toString()}.`));
                    return commandResult.status.toString() ?? '';
                }
                else
                {
                    // A signal is generally given if a status is not given, and they are 'equivalent' enough
                    if(commandResult.signal !== null)
                    {
                        this.context.eventStream.post(new CommandExecutionSignalSentEvent(`The command ${fullCommandStringForTelemetryOnly} exited
with signal: ${commandResult.signal.toString()}.`));
                        return commandResult.signal.toString() ?? '';
                    }
                    else
                    {
                        this.context.eventStream.post(new CommandExecutionNoStatusCodeWarning(`The command ${fullCommandStringForTelemetryOnly} with
result: ${commandResult.toString()} had no status or signal.`));
                        return '000751'; // Error code 000751 : The command did not report an exit code upon completion. This is never expected
                    }
                }
            }
            else
            {
                if(!commandResult.stdout && !commandResult.stderr)
                {
                    return '';
                }
                else
                {
                    if(commandResult.stdout)
                    {
                    this.context.eventStream.post(new CommandExecutionStdOut(`The command ${fullCommandStringForTelemetryOnly} encountered stdout:
${commandResult.stdout}`));
                    }
                    if(commandResult.stderr)
                    {
                        this.context.eventStream.post(new CommandExecutionStdError(`The command ${fullCommandStringForTelemetryOnly} encountered stderr:
${commandResult.stderr}`));
                    }
                    return commandResult.stdout?.toString() + commandResult.stderr?.toString() ?? '';
                }
            }
        }
    }

    /**
     *
     * @param commandRoots The first word of each command to try
     * @param matchingCommandParts Any follow up words in that command to execute, matching in the same order as commandRoots
     * @returns the index of the working command you provided, if no command works, -1.
     */
    public async tryFindWorkingCommand(commands : CommandExecutorCommand[]) : Promise<CommandExecutorCommand | null>
    {
        const oldReturnStatusSetting = this.returnStatus;
        this.returnStatus = true;

        let workingCommand : CommandExecutorCommand | null = null;

        for(const command of commands)
        {
            try
            {
                const cmdFoundOutput = await this.execute(command);
                if(cmdFoundOutput === '0')
                {
                    workingCommand = command;
                    this.context.eventStream.post(new DotnetAlternativeCommandFoundEvent(`The command ${command.commandRoot} was found.`));
                    break;
                }
                else
                {
                    this.context.eventStream.post(new DotnetCommandNotFoundEvent(`The command ${command.commandRoot} was NOT found, no error was thrown.`));
                }
            }
            catch(err)
            {
                // Do nothing. The error should be raised higher up.
                this.context.eventStream.post(new DotnetCommandNotFoundEvent(`The command ${command.commandRoot} was NOT found, and we caught any errors.`));
            }
        };

        this.returnStatus = oldReturnStatusSetting;
        return workingCommand;
    }

    public async setEnvironmentVariable(variable : string, value : string, vscodeContext : IVSCodeExtensionContext, failureWarningMessage? : string, nonWinFailureMessage? : string)
    {
        const oldReturnStatusSetting = this.returnStatus;
        this.returnStatus = true;
        let environmentEditExitCode = 0;

        process.env[variable] = value;
        vscodeContext.setVSCodeEnvironmentVariable(variable, value);

        if(os.platform() === 'win32')
        {
            const setShellVariable = CommandExecutor.makeCommand(`set`, [`${variable}=${value}`]);
            const setSystemVariable = CommandExecutor.makeCommand(`setx`, [`${variable}`, `"${value}"`]);
            try
            {
                const shellEditResponse = await this.execute(setShellVariable);
                environmentEditExitCode += Number(shellEditResponse[0]);
                const systemEditResponse = await this.execute(setSystemVariable)
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
        this.returnStatus = oldReturnStatusSetting;
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
