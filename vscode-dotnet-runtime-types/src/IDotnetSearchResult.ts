/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetInstallMode } from './DotnetInstallMode';

/**
 * The result of searching for .NET installations.
 */
export interface IDotnetSearchResult {
    /**
     * The type of .NET installation found.
     */
    mode: DotnetInstallMode;

    /**
     * The version of the installation.
     */
    version: string;

    /**
     * The directory where the installation is located.
     */
    directory: string;

    /**
     * Architecture will default to os.arch() if it cannot be determined.
     */
    architecture: string;
}
