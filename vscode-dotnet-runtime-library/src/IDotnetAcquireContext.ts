/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { AcquireErrorConfiguration } from './Utils/ErrorHandler';

export interface IDotnetAcquireContext {
    /**
     * @remarks
     * The data required to acquire either the sdk or the runtime.
     *
     * @property version - The major.minor version of the SDK or Runtime desired.
     *
     * NOTE: For global SDK installations, more options are available.
     * The version can be provided in the following format in this acquisition:
     * Major (e.g: 6)
     * Major.Minor (e.g: 3.1)
     * Feature Band (e.g: 7.0.1xx or 7.0.10x)
     * Specific Version / Fully-Qualified Version (e.g: 8.0.103)
     *
     * @property requestingExtensionId - The Extension that relies on our extension to acquire the runtime or .NET SDK. It MUST be provided.
     *
     * @property errorConfiguration - An set of options for the desired treat as error and error verbosity behaviors of the extension.
     *
     * @property installType - For SDK installations, allows either global or local installs.
     * Do NOT use the local install feature with the global install feature or any global install as it is currently unsupported.
     */
    version: string;
    requestingExtensionId?: string;
    errorConfiguration?: AcquireErrorConfiguration;
    installType?: DotnetInstallType;
}

/**
 * @remarks
 * Defines if an install should be global on the machine or local to a specific local folder/user.
 */
export type DotnetInstallType = 'local' | 'global';
