/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

export abstract class IVSCodeEnvironment
{
    /**
     * @returns True on success of setting environment for vscode.
     */
    abstract isTelemetryEnabled() : boolean;
}
