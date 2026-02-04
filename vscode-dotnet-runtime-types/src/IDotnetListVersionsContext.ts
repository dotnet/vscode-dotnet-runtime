/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { AcquireErrorConfiguration } from './ErrorConfiguration';

/**
 * The context/parameters for listing available .NET versions.
 */
export interface IDotnetListVersionsContext {
    /**
     * If this is not true (false or undefined), list SDK versions available. Elsewise, list runtimes available.
     */
    listRuntimes: boolean | null;

    /**
     * Do we want to show pop-ups for errors? Use this for this option and other options in the event of an error.
     */
    errorConfiguration?: AcquireErrorConfiguration;
}

/**
 * The result/response from the API that returns available SDKs/Runtimes.
 */
export type IDotnetListVersionsResult = IDotnetVersion[];

/**
 * Information regarding the version of the .NET SDK / Runtime.
 */
export interface IDotnetVersion {
    /**
     * The full version of the SDK or Runtime. May include text such as -Preview.
     */
    version: string;

    /**
     * Is the version in long-term support or 'standard-term' support.
     */
    supportStatus: DotnetVersionSupportStatus;

    /**
     * Whether the version is actively in support or in some other stage of support.
     */
    supportPhase: DotnetVersionSupportPhase;

    /**
     * The major.minor version.
     */
    channelVersion: string;
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
