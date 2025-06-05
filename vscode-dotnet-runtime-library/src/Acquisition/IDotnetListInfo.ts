/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetInstallMode } from "./DotnetInstallMode";

export interface IDotnetListInfo { mode: DotnetInstallMode, version: string, directory : string, architecture: string | null };
