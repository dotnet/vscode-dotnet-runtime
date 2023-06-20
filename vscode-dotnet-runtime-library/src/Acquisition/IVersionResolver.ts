/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export interface IVersionResolver
{
    getFullRuntimeVersion(version: string): Promise<string>;
    getFullSDKVersion(version: string): Promise<string>;
}
