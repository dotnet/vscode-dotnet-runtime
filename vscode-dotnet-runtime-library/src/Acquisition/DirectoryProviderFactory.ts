/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { ASPNetRuntimeInstallationDirectoryProvider } from './ASPNetRuntimeInstallationDirectoryProvider';
import { DotnetInstallMode } from './DotnetInstallMode';
import { IInstallationDirectoryProvider } from './IInstallationDirectoryProvider';
import { RuntimeInstallationDirectoryProvider } from './RuntimeInstallationDirectoryProvider';
import { SdkInstallationDirectoryProvider } from './SdkInstallationDirectoryProvider';


export function directoryProviderFactory(mode: DotnetInstallMode, storagePath: string) : IInstallationDirectoryProvider
{
    return mode === 'runtime' ? new RuntimeInstallationDirectoryProvider(storagePath) :
    mode === 'sdk' ? new SdkInstallationDirectoryProvider(storagePath) :
    mode === 'aspnetcore' ? new ASPNetRuntimeInstallationDirectoryProvider(storagePath)
    : new RuntimeInstallationDirectoryProvider(storagePath); // default if no mode is provided - should never happen
}
