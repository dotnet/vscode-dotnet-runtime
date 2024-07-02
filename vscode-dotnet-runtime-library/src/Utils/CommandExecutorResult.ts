/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
 *  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export type CommandExecutorResult =
{
    /**
     * @property commandRoot
     * The stdout of the command.
     * @property commandParts
     * The stderr of the command.
     * @property status
     * The exit code of the program/command after execution.
     */
    stdout : string,
    stderr : string,
    status : string
}