/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
/* tslint:disable:no-any */

import { IEventStream } from '../EventStream/EventStream';

export abstract class ICommandExecutor
{
    constructor(eventStream : IEventStream)
    {
        this.eventStream = eventStream;
    }

    protected eventStream : IEventStream;

    /**
     * @remarks Set this to true if you don't want to capture stdout and stderr, and just want to return the status / exit code.
     * Note: For the .NET Installers, all they will return is a status.
     */
    public returnStatus = false;

    /**
     *
     * @param command The command to execute, with arguments separated by spaces in the string.
     * @param options Options to forward to the execSync command.
     */
    public abstract execute(command : string, options? : any | null) : Promise<string[]>;

    /**
     *
     * @param commands The set of commands to see if one of them is available/works.
     * @returns the working command (if any) and a boolean for true or false if a command was available.
     */
    public abstract TryFindWorkingCommand(commands : string[]) : Promise<[string, boolean]>;
};
