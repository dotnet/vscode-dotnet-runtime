/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export interface IDotnetListVersionsContext {
    /**
     * @remarks
     * Holds the parameters necessary to acquire the available SDK or Runtimes.
     * By available, this means all in-support SDKs or Runtimes, and only those at the newest minor version for each major version.
     *
     * @property listRuntimes - If this is not true (false or undefined), list SDK versions available. Elsewise, list runtimes available.
     */
    listRuntimes: boolean | null
}

export interface IDotnetListVersionsResult {
    /**
     * @remarks
     * The result/response from the API to be implemented that returns available SDKs/Runtimes.
     */
    result: IDotnetVersion[]
}

export interface IDotnetVersion {
    /**
     * @remarks
     * Information regarding the version of the .NET SDK / Runtime.
     *
     * @property version - The channel version (major) version.
     * @property supportStatus - Is the version in long-term support or 'standard-term' support
     */
	version: string,
    supportStatus: DotnetVersionSupportStatus
}

/**
 * @remarks
 * lts: Long-term support
 * sts: Standard-term support
 */
export type DotnetVersionSupportStatus = 'lts' | 'sts'; 