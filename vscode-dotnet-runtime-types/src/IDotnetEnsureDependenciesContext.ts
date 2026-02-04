/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { EnsureDependenciesErrorConfiguration } from './ErrorConfiguration';

/**
 * The context/parameters for ensuring .NET dependencies are installed.
 * This is primarily used on Linux to ensure required system libraries are present.
 */
export interface IDotnetEnsureDependenciesContext {
    /**
     * The command to execute for checking/installing dependencies.
     */
    command: string;

    /**
     * Arguments to pass to the command. Should include encoding and other spawn options.
     */
    arguments: {
        encoding: 'utf8' | 'ascii' | 'utf-8' | 'utf16le' | 'ucs2' | 'ucs-2' | 'base64' | 'latin1' | 'binary' | 'hex';
        [key: string]: unknown;
    };

    /**
     * Configuration for error handling.
     */
    errorConfiguration?: EnsureDependenciesErrorConfiguration;
}
