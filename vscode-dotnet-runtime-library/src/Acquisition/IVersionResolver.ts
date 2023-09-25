/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

export interface IVersionResolver {
    getFullRuntimeVersion(version: string): Promise<string>;
    getFullSDKVersion(version: string): Promise<string>;
}
