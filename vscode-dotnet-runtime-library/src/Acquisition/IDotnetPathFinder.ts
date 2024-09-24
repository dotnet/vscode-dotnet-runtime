/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

export interface IDotnetPathFinder
{
    findDotnetRootPath(): Promise<string | undefined>;
    findRawPathEnvironmentSetting(tryUseTrueShell : boolean): Promise<string | undefined>;
    findRealPathEnvironmentSetting(tryUseTrueShell : boolean): Promise<string | undefined>;
}
