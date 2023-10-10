/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as proc from 'child_process';
import { CommandExecutionEvent, CommandExecutionNoStatusCodeWarning, CommandExecutionSignalSentEvent, CommandExecutionStatusEvent, CommandExecutionStdError, CommandExecutionUnderSudoEvent, CommandExecutionUserCompletedDialogueEvent, DotnetAlternativeCommandFoundEvent, DotnetCommandNotFoundEvent, DotnetWSLSecurityError } from '../EventStream/EventStreamEvents';
import {exec} from '@vscode/sudo-prompt';
import { ICommandExecutor } from './ICommandExecutor';
import path = require('path');
import { IEventStream } from '../EventStream/EventStream';
/* tslint:disable:no-any */

export class CommandExecutor extends ICommandExecutor
{

    constructor(eventStream : IEventStream)
    {
        super(eventStream);
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
     * @param commandFollowUps The strings/args/options after the first word in the command.
     * @returns The output of the command.
     */
    private async ExecSudoAsync(commandFollowUps : string[]) : Promise<string>
    {
        this.eventStream.post(new CommandExecutionUnderSudoEvent(`The command ${commandFollowUps} is being ran under sudo.`));

        if(this.isRunningUnderWSL())
        {
            // For WSL, vscode/sudo-prompt does not work.
            // This is because it relies on pkexec or a GUI app to popup and request sudo privilege.
            // GUI in WSL is not supported, so it will fail.
            // We had a working implementation that opens a vscode box and gets the user password, but that will require more security analysis.

            const err = new DotnetWSLSecurityError(new Error(`Automatic .NET SDK Installation is not yet supported in WSL due to VS Code & WSL limitations.
Please install the .NET SDK manually and add it to the path by following https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#manually-installing-net`));
            this.eventStream.post(err);
            throw err.error;
        }

        // We wrap the exec in a promise because there is no synchronous version of the sudo exec command for vscode/sudo
        return new Promise<string>((resolve, reject) =>
        {
            // The '.' character is not allowed for sudo-prompt so we use 'DotNET'
            const options = { name: 'VS Code DotNET Acquisition' };
            exec(commandFollowUps.join(' '), options, (error?: any, stdout?: any, stderr?: any) =>
            {
                let commandResultString = '';

                if (stdout)
                {
                    commandResultString += stdout;
                }
                if (stderr)
                {
                    this.eventStream.post(new CommandExecutionStdError(`The command ${commandFollowUps} encountered stderr, continuing. ${stderr}.`));
                    commandResultString += stderr;
                }

                if (error)
                {
                    this.eventStream.post(new CommandExecutionUserCompletedDialogueEvent(`The command ${commandFollowUps} failed to run under sudo.`));
                    reject(error);
                }
                else
                {
                    this.eventStream.post(new CommandExecutionUserCompletedDialogueEvent(`The command ${commandFollowUps} successfully ran under sudo.`));
                    resolve(commandResultString);
                }
            });
        });
    }

    /**
     *
     * @param command The command to run as a whole string. Commands with && will be run individually. Sudo commands will request sudo from the user.
     * @param workingDirectory - the directory to execute in. Only works for non sudo commands.
     *
     * @returns the result(s) of each command. Can throw generically if the command fails.
     */
    public async execute(command : string, options : any | null = null) : Promise<string[]>
    {
        if(!options)
        {
            options = {cwd : path.resolve(__dirname)};
        }

        const splitCommands : string[] = command.split('&&');
        const commandResults : string[] = [];

        for (let isolatedCommand of splitCommands)
        {
            isolatedCommand = isolatedCommand.trim();
            const rootCommand = isolatedCommand.split(' ')[0];
            const commandFollowUps : string[] = isolatedCommand.split(' ').slice(1);

            if(rootCommand === 'sudo')
            {
                const commandResult = await this.ExecSudoAsync(commandFollowUps);
                commandResults.push(commandResult);
            }
            else
            {
                this.eventStream.post(new CommandExecutionEvent(`The command ${command} is being executed with options ${splitCommands} and ${options}.`));
                const commandResult = proc.spawnSync(rootCommand, commandFollowUps, options);
                if(this.returnStatus)
                {
                    if(commandResult.status !== null)
                    {
                        this.eventStream.post(new CommandExecutionStatusEvent(`The command ${command} exited with status: ${commandResult.status.toString()}.`));
                        commandResults.push(commandResult.status.toString());
                    }
                    else
                    {
                        // A signal is generally given if a status is not given, and they are equivalent
                        if(commandResult.signal !== null)
                        {
                            this.eventStream.post(new CommandExecutionSignalSentEvent(`The command ${command} exited with signal: ${commandResult.signal.toString()}.`));
                            commandResults.push(commandResult.signal.toString());
                        }
                        else
                        {
                            this.eventStream.post(new CommandExecutionNoStatusCodeWarning(`The command ${command} with ${commandResult} had no status or signal.`));
                            commandResults.push('000751'); // Error code 000751 : The command did not report an exit code upon completion. This is never expected
                        }
                    }
                }
                else
                {
                    if(commandResult.stdout === null && commandResult.stderr === null)
                    {
                        commandResults.push('');
                    }
                    else
                    {
                        this.eventStream.post(new CommandExecutionStdError(`The command ${command} with follow ups ${commandFollowUps} encountered stdout and or stderr, continuing.
out: ${commandResult.stdout} err: ${commandResult.stderr}.`));
                        commandResults.push(commandResult.stdout?.toString() + commandResult.stderr?.toString());
                    }
                }
            }
        }

        return commandResults;
    }

    public async TryFindWorkingCommand(commands : string[]) : Promise<[string, boolean]>
    {
        let workingCommand = '';
        let working = false;

        const oldReturnStatusSetting = this.returnStatus;
        this.returnStatus = true;

        for(const command of commands)
        {
            try
            {
                const cmdFoundOutput = (await this.execute(command))[0];
                if(cmdFoundOutput === '0')
                {
                    working = true;
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
        }

        this.returnStatus = oldReturnStatusSetting;
        return [workingCommand, working];
    }
}
