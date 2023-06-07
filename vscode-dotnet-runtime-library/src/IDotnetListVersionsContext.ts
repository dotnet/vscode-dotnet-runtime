/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { AcquireErrorConfiguration } from './Utils/ErrorHandler';

export interface IDotnetListVersionsContext {
    /**
     * @remarks
     * Holds the parameters necessary to acquire the available SDK or Runtimes.
     * By available this means only those at the newest minor version for each major version.
     *
     * @property listRuntimes - If this is not true (false or undefined), list SDK versions available. Elsewise, list runtimes available.
     * @property errorConfiguration - Do we want to show pop-ups for errors? Use this for this option and other options in the event of an error.
     */
    listRuntimes: boolean | null,
    errorConfiguration?: AcquireErrorConfiguration;
}

/**
 * @remarks
 * The result/response from the API to be implemented that returns available SDKs/Runtimes.
 */
export type IDotnetListVersionsResult = IDotnetVersion[]

export interface IDotnetVersion {
    /**
     * @remarks
     * Information regarding the version of the .NET SDK / Runtime.
     *
     * @property version - The full version of the SDK or Runtime. May include text such as -Preview.
     * @property channelVersion - The major.minor version.
     * @property supportPhase - Whether the version is actively in support or in some other stage of support.
     * @property supportStatus - Is the version in long-term support or 'standard-term' support
     */
    version: string,
    supportStatus: DotnetVersionSupportStatus,
    supportPhase: DotnetVersionSupportPhase,
    channelVersion: string,
}

/**
 * @remarks
 * lts: Long-term support
 * sts: Standard-term support
 */
export type DotnetVersionSupportStatus = 'lts' | 'sts';

/**
 * @remarks
 * preview support does not mean the development is stable and actively supported.
 */
export type DotnetVersionSupportPhase = 'active' | 'preview' | 'eol' | 'go-live' | 'maintenance';
