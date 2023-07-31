/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as proc from 'child_process';
import { DotnetWSLSecurityError } from '../EventStream/EventStreamEvents';
import {exec} from '@vscode/sudo-prompt';
import { ICommandExecutor } from './ICommandExecutor';
import path = require('path');
/* tslint:disable:no-any */

export class CommandExecutor extends ICommandExecutor
{
    /**
     * Returns true if the linux agent is running under WSL, false elsewise.
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
        if(this.isRunningUnderWSL())
        {
            // For WSL, vscode/sudo-prompt does not work.
            // This is because it relies on pkexec or a GUI app to popup and request sudo privellege.
            // GUI in WSL is not supported, so it will fail.
            // We can open a vscode box and get the user password, but that will require more security analysis.

            const err = new DotnetWSLSecurityError(new Error(`Automatic SDK Acqusition is not yet supported in WSL due to security concerns.`));
            throw err;
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
                    commandResultString += stderr;
                }

                if (error)
                {
                    reject(error);
                }
                else
                {
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

        for (const isolatedCommand of splitCommands)
        {
            const rootCommand = isolatedCommand.split(' ')[0];
            const commandFollowUps : string[] = isolatedCommand.split(' ').slice(1);

            if(rootCommand === 'sudo')
            {
                const commandResult = await this.ExecSudoAsync(commandFollowUps);
                commandResults.push(commandResult);
            }
            else
            {
                const commandResult = proc.spawnSync(rootCommand, commandFollowUps, options);
                if(this.returnStatus)
                {
                    if(commandResult.status !== null)
                    {
                        commandResults.push(commandResult.status.toString());
                    }
                    else
                    {
                        // A signal is generally given if a status is not given, and they are equivalent
                        if(commandResult.signal !== null)
                        {
                            commandResults.push(commandResult.signal.toString());
                        }
                        else
                        {
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
                        commandResults.push(commandResult.stdout?.toString() + commandResult.stderr?.toString());
                    }
                }
            }
        }

        return commandResults;
    }
}
