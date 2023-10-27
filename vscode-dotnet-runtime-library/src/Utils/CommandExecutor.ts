/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as proc from 'child_process';
import {
    CommandExecutionEvent,
    CommandExecutionNoStatusCodeWarning,
    CommandExecutionSignalSentEvent,
    CommandExecutionStatusEvent,
    CommandExecutionStdError,
    CommandExecutionUnderSudoEvent,
    CommandExecutionUserCompletedDialogueEvent,
    DotnetAlternativeCommandFoundEvent,
    DotnetCommandNotFoundEvent,
    DotnetWSLSecurityError
} from '../EventStream/EventStreamEvents';
import {exec} from '@vscode/sudo-prompt';
import { ICommandExecutor } from './ICommandExecutor';
import path = require('path');
import { IEventStream } from '../EventStream/EventStream';
import * as os from 'os';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { IUtilityContext } from './IUtilityContext';
import { CommandExecutorCommand, IDotnetAcquireContext } from '..';

/* tslint:disable:no-any */

export class CommandExecutor extends ICommandExecutor
{
    constructor(eventStream : IEventStream, utilContext : IUtilityContext, acquireContext? : IDotnetAcquireContext)
    {
        super(eventStream, utilContext, acquireContext);
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
    private async ExecSudoAsync(command : CommandExecutorCommand) : Promise<string>
    {
        this.eventStream.post(new CommandExecutionUnderSudoEvent(`The command ${command} is being ran under sudo.`));

        if(this.isRunningUnderWSL())
        {
            // For WSL, vscode/sudo-prompt does not work.
            // This is because it relies on pkexec or a GUI app to popup and request sudo privilege.
            // GUI in WSL is not supported, so it will fail.
            // We had a working implementation that opens a vscode box and gets the user password, but that will require more security analysis.

            const err = new DotnetWSLSecurityError(new Error(`Automatic .NET SDK Installation is not yet supported in WSL due to VS Code & WSL limitations.
Please install the .NET SDK manually by following https://learn.microsoft.com/en-us/dotnet/core/install/linux-ubuntu. Then, add it to the path by following https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#manually-installing-net`));
            this.eventStream.post(err);
            throw err.error;
        }

        // We wrap the exec in a promise because there is no synchronous version of the sudo exec command for vscode/sudo
        return new Promise<string>((resolve, reject) =>
        {
            // The '.' character is not allowed for sudo-prompt so we use 'NET'
            const options = { name: `${this.acquisitionContext?.requestingExtensionId} On behalf of NET Install Tool` };
            const fullCommandString = CommandExecutor.prettifyCommandExecutorCommand(command, false);
            exec((fullCommandString), options, (error?: any, stdout?: any, stderr?: any) =>
            {
                let commandResultString = '';

                if (stdout)
                {
                    commandResultString += stdout;
                }
                if (stderr)
                {
                    this.eventStream.post(new CommandExecutionStdError(`The command ${fullCommandString} encountered stderr, continuing. ${stderr}.`));
                    commandResultString += stderr;
                }

                if (error)
                {
                    this.eventStream.post(new CommandExecutionUserCompletedDialogueEvent(`The command ${fullCommandString} failed to run under sudo.`));
                    reject(error);
                }
                else
                {
                    this.eventStream.post(new CommandExecutionUserCompletedDialogueEvent(`The command ${fullCommandString} successfully ran under sudo.`));
                    resolve(commandResultString);
                }
            });
        });
    }

    public async executeMultipleCommands(commands: CommandExecutorCommand[], options?: any): Promise<string[]> {
        const results = [];
        for(const command of commands)
        {
            results.push(await this.execute(command, options));
        }

        return results;
    }

    /**
     *
     * @param workingDirectory The directory to execute in. Only works for non sudo commands.
     *
     * @returns the result(s) of each command. Can throw generically if the command fails.
     */
    public async execute(command : CommandExecutorCommand, options : any | null = null) : Promise<string>
    {
        const fullCommandStringForTelemetryOnly = `${command.commandRoot} ${command.commandParts.join(' ')}`;
        if(!options)
        {
            options = {cwd : path.resolve(__dirname), shell: true};
        }

        if(command.runUnderSudo)
        {
            return this.ExecSudoAsync(command) ?? '';
        }
        else
        {
            this.eventStream.post(new CommandExecutionEvent(`Executing command ${command.toString()} or ${fullCommandStringForTelemetryOnly}
with options ${options.toString()}.`));
            const commandResult = proc.spawnSync(command.commandRoot, command.commandParts, options);
            if(this.returnStatus)
            {
                if(commandResult.status !== null)
                {
                    this.eventStream.post(new CommandExecutionStatusEvent(`The command ${command.toString()} or ${fullCommandStringForTelemetryOnly} exited
with status: ${commandResult.status.toString()}.`));
                    return commandResult.status.toString() ?? '';
                }
                else
                {
                    // A signal is generally given if a status is not given, and they are 'equivalent' enough
                    if(commandResult.signal !== null)
                    {
                        this.eventStream.post(new CommandExecutionSignalSentEvent(`The command ${command.toString()} or ${fullCommandStringForTelemetryOnly} exited
with signal: ${commandResult.signal.toString()}.`));
                        return commandResult.signal.toString() ?? '';
                    }
                    else
                    {
                        this.eventStream.post(new CommandExecutionNoStatusCodeWarning(`The command ${command.toString()} or ${fullCommandStringForTelemetryOnly} with
result: ${commandResult.toString()} had no status or signal.`));
                        return '000751'; // Error code 000751 : The command did not report an exit code upon completion. This is never expected
                    }
                }
            }
            else
            {
                if(commandResult.stdout === null && commandResult.stderr === null)
                {
                    return '';
                }
                else
                {
                    this.eventStream.post(new CommandExecutionStdError(`The command ${command.toString()} or ${fullCommandStringForTelemetryOnly} encountered stdout and or stderr, continuing.
out: ${commandResult.stdout} err: ${commandResult.stderr}.`));
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
                    this.eventStream.post(new DotnetAlternativeCommandFoundEvent(`The command ${command} was found.`));
                    break;
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
}
