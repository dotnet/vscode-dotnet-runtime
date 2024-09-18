/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IDotnetFindPathContext } from '../IDotnetFindPathContext';

export interface IDotnetConditionValidator
{
    versionMeetsRequirement(dotnetExecutablePath: string, requirement : IDotnetFindPathContext): Promise<boolean>;
}
