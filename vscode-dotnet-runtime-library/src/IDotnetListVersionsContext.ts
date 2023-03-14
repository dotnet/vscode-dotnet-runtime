/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export interface IDotnetListVersionsContext {
}

export interface IDotnetListVersionsResponse {
    response: IDotnetVersion[]
}

export interface IDotnetVersion {
	version: string,
    supportStatus: DotnetVersionSupportStatus
}

export type DotnetVersionSupportStatus = 'lts' | 'sts'; 