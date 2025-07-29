/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetInstallMode } from './Acquisition/DotnetInstallMode';

export interface IDotnetSearchResult
{
    mode: DotnetInstallMode,
    version: string,
    directory: string,
    architecture: string // Architecture will default to os.arch() if it cannot be determined, which should not happen except in cases such as: a dotnet executable built for arm32 or custom architecture such as `Silicon Graphics SVx`, or a corrupt dotnet executable.
};
