/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { AcquireErrorConfiguration } from './Utils/ErrorConstants';

export interface IDotnetAcquireContext {
    version: string;
    errorConfiguration?: AcquireErrorConfiguration;
}
