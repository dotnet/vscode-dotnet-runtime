/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

/**
 * The result of a successful .NET acquisition.
 */
export interface IDotnetAcquireResult {
    /**
     * The path to the dotnet executable.
     */
    dotnetPath: string;
}
