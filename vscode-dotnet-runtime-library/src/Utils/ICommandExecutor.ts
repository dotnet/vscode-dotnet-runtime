/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
 *  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
/*
tslint:disable:no-any */

import { CommandExecutorCommand } from './CommandExecutorCommand';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { IUtilityContext } from './IUtilityContext';

export abstract class ICommandExecutor
{
    constructor(protected readonly context : IAcquisitionWorkerContext | null, utilContext : IUtilityContext)
    {
        this.utilityContext = utilContext;
    }

    protected utilityContext : IUtilityContext;

    /**
     * @remarks Set this to true if you don't want to capture stdout and stderr, and just want to return the status / exit code.
     * Note: For the .NET Installers, all they will return is a status.
     */
    public returnStatus = false;

    /**
     *
     * @param workingDirectory The directory to execute in. Only works for non sudo commands.
     *
     * @returns the parsed result of the command.
     */
    public abstract execute(command : CommandExecutorCommand, options? : any, terminalFailure? : boolean) : Promise<string>;

    /**
     *
     * @param workingDirectory The directory to execute in. Only works for non sudo commands.
     *
     * @returns the result(s) of each command in the same order they were requested. Can throw generically if the command fails.
     */
    public abstract executeMultipleCommands(commands : CommandExecutorCommand[], options? : any, terminalFailure? : boolean) : Promise<string[]>;

    /**
     *
     * @param commands The set of commands to see if one of them is available/works.
     * @returns the working command index if one is available, else -1.
     */
    public abstract tryFindWorkingCommand(commands : CommandExecutorCommand[]) : Promise<CommandExecutorCommand | null>;

    public static makeCommand(command : string, args : string[], isSudo = false) : CommandExecutorCommand
    {
        return {
            commandRoot: command,
            commandParts: args,
            runUnderSudo: isSudo
        };
    }

    public static prettifyCommandExecutorCommand(command : CommandExecutorCommand, includeSudo = true) : string
    {
        return `${command.runUnderSudo && includeSudo ? `sudo ` : ``}${command.commandRoot} ${command.commandParts.join(' ')}`
    }

    public static replaceSubstringsInCommand(command : CommandExecutorCommand, substring : string, replacement : string) : CommandExecutorCommand
    {
        const newCommandRoot = command.commandRoot.replace(substring, replacement);
        const newCommandParts: string[] = [];
        for(const commandPart of command.commandParts)
        {
            newCommandParts.push(commandPart.replace(substring, replacement));
        }
        return {
            commandRoot: newCommandRoot,
            commandParts: newCommandParts,
            runUnderSudo: command.runUnderSudo
        } as CommandExecutorCommand
    }

    public static replaceSubstringsInCommands(commands : CommandExecutorCommand[], substring : string, replacement : string) : CommandExecutorCommand[]
    {
        const newCommands : CommandExecutorCommand[] = [];
        for(const command of commands)
        {
            newCommands.push(this.replaceSubstringsInCommand(command, substring, replacement));
        }
        return newCommands;
    }
};
