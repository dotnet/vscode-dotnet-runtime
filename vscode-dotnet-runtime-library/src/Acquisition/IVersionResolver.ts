/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetInstallMode } from './DotnetInstallMode';

export interface IVersionResolver
{
    getFullVersion(version: string, mode : DotnetInstallMode): Promise<string>;
}
