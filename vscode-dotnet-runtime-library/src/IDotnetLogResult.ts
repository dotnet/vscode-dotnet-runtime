/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

/**
 * The result of the dotnet.getAcquisitionLog command.
 * Contains the full path to the log file for this VS Code window/instance
 * of the .NET Install Tool extension.
 */
export interface IDotnetLogResult {
    logPath: string;
}
