/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetInstallMode } from './DotnetInstallMode';
import { IDotnetListInfo } from './IDotnetListInfo';

export interface IDotnetResolver
{
    getDotnetInstalls(dotnetExecutablePath: string, mode: DotnetInstallMode, requestedArchitecture: string | undefined | null): Promise<IDotnetListInfo[]>
    getSDKs(existingPath: string, requestedArchitecture: string, knownArchitecture: boolean): Promise<IDotnetListInfo[]>
    getRuntimes(existingPath: string, requestedArchitecture: string | null, knownArchitecture: boolean): Promise<IDotnetListInfo[]>
}
