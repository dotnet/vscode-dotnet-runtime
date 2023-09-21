/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
export interface IDotnetInstallationContext {
    installDir: string;
    version: string;
    dotnetPath: string;
    timeoutValue: number;
    installRuntime: boolean;
}
