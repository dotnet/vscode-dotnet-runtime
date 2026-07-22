/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
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