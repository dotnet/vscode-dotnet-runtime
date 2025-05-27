/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { InstallRecordWithPath } from './InstallRecordWithPath';

export interface IDotnetPathFinder
{
    findDotnetRootPath(requestedArchitecture: string): Promise<string | undefined>;
    findRawPathEnvironmentSetting(tryUseTrueShell: boolean): Promise<string[] | undefined>;
    findRealPathEnvironmentSetting(tryUseTrueShell: boolean): Promise<string[] | undefined>;
    findHostInstallPaths(requestedArchitecture: string): Promise<string[] | undefined>;
    findExtensionManagedRuntimes(): Promise<InstallRecordWithPath[]>;
}
