/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
/* tslint:disable:no-any */

import { IDotnetAcquireContext } from '..';
import { IEventStream } from '../EventStream/EventStream';
import { IUtilityContext } from './IUtilityContext';

export type CommandExecutorCommand =
{
    /**
     * @property commandRoot
     * The command first 'word' to run, example: 'dotnet --info' has a first word of 'dotnet'
     * @property commandParts
     * The remaining strings in the command to execute, example: 'dotnet build foo.csproj' will be ['build', 'foo.csproj']
     * @property runUnderSudo
     * Use this if the command should be executed under sudo on linux.
     */
    commandRoot : string,
    commandParts : string[],
    runUnderSudo : boolean
}

export abstract class ICommandExecutor
{
    constructor(eventStream : IEventStream, utilContext : IUtilityContext, acquireContext? : IDotnetAcquireContext)
    {
        this.eventStream = eventStream;
        this.utilityContext = utilContext;
        this.acquisitionContext = acquireContext;
    }

    protected eventStream : IEventStream;
    protected utilityContext : IUtilityContext;
    protected acquisitionContext? : IDotnetAcquireContext;

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
    public abstract execute(command : CommandExecutorCommand, options? : any) : Promise<string>;

    /**
     *
     * @param workingDirectory The directory to execute in. Only works for non sudo commands.
     *
     * @returns the result(s) of each command in the same order they were requested. Can throw generically if the command fails.
     */
    public abstract executeMultipleCommands(commands : CommandExecutorCommand[], options? : any) : Promise<string[]>;

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
