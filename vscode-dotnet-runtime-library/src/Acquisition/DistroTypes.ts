/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export interface DistroVersionPair
{
    distro: string,
    version: string
}

export const enum DotnetDistroSupportStatus
{
    Unsupported = 'UNSUPPORTED',
    Distro = 'DISTRO',
    Microsoft = 'MICROSOFT',
    Partial = 'PARTIAL',
    Unknown = 'UNKNOWN'
}