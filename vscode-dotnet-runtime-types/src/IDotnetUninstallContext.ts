/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { UninstallErrorConfiguration } from './ErrorConfiguration';

/**
 * The context/parameters for uninstalling a .NET installation.
 */
export interface IDotnetUninstallContext {
    /**
     * Configuration for error handling during uninstallation.
     */
    errorConfiguration?: UninstallErrorConfiguration;
}
