/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { UninstallErrorConfiguration } from './Utils/ErrorHandler';

export interface IDotnetUninstallContext {
    version?: string // Provide this when uninstalling a specific version. If you want to uninstall all local items, then call the uninstallAll api without a version.
    errorConfiguration?: UninstallErrorConfiguration;
}
