/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetVersionSpecRequirement } from './DotnetVersionSpecRequirement';
import { IDotnetAcquireContext } from './IDotnetAcquireContext';

export interface IDotnetFindPathContext
{
    acquireContext: IDotnetAcquireContext;
    versionSpecRequirement: DotnetVersionSpecRequirement;
    rejectPreviews?: boolean;
}