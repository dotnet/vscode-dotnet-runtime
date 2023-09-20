/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { AcquireErrorConfiguration } from './Utils/ErrorHandler';

export interface IDotnetAcquireContext {
    version: string;
    requestingExtensionId?: string;
    errorConfiguration?: AcquireErrorConfiguration;
    /**
     * architecture - null is for deliberate legacy install behavior that is not-architecture specific.
     * undefined is for the default of node.arch().
     * Does NOT impact global installs. Follows node architecture terminology.
     */
    architecture?: string | null | undefined;
}
