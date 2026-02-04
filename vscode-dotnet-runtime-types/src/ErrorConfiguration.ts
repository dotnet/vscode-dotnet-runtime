/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

/**
 * Configuration for error handling during .NET acquisition.
 */
export enum AcquireErrorConfiguration {
    DisplayAllErrorPopups = 0,
    DisableErrorPopups = 1,
}

/**
 * Configuration for error handling during .NET uninstallation.
 */
export enum UninstallErrorConfiguration {
    DisplayAllErrorPopups = 0,
    DisableErrorPopups = 1,
}

/**
 * Configuration for error handling during dependency installation.
 */
export enum EnsureDependenciesErrorConfiguration {
    DisplayAllErrorPopups = 0,
    DisableErrorPopups = 1,
}
