/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetInstallType } from '..';
import { DotnetInstallMode } from './DotnetInstallMode';

export interface IDotnetInstallationContext {
    installDir: string;
    version: string;
    dotnetPath: string;
    timeoutSeconds: number;
    installRuntime: boolean; // kept to remove breaking change
    installMode : DotnetInstallMode;
    installType : DotnetInstallType;
    architecture: string;
}
