/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
 *  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

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