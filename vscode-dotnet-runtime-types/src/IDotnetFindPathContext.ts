/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetVersionSpecRequirement } from './DotnetVersionSpecRequirement';
import { IDotnetAcquireContext } from './IDotnetAcquireContext';

/**
 * The context/parameters for finding an existing .NET installation path.
 */
export interface IDotnetFindPathContext {
    /**
     * The acquisition context describing what version/mode of .NET to find.
     */
    acquireContext: IDotnetAcquireContext;

    /**
     * The version requirement/condition for matching .NET versions.
     */
    versionSpecRequirement: DotnetVersionSpecRequirement;

    /**
     * Whether to reject preview versions when searching.
     */
    rejectPreviews?: boolean;

    /**
     * Set to true to not find local vscode-managed installs. Default/undefined is 'false'.
     */
    disableLocalLookup?: boolean;
}
