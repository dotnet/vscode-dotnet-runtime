/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
/**
 * @remarks A condition to be met when searching for .NET. This refers to the major.minor of .NET versions.
 * When this condition is used, the available version is compared to the required version.
 * For example, if the request is made looking for 8.0 and allowing 'greater_than_or_equal', then 10.0 would be accepted,
 * because 10.0 >= 8.0.
 */
export type DotnetVersionSpecRequirement = 'equal' | 'greater_than_or_equal' | 'less_than_or_equal';

