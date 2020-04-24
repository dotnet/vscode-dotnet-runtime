/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { ErrorConfiguration } from './Utils/Constants';

export interface IDotnetAcquireContext {
    version: string;
    errorConfiguration?: ErrorConfiguration;
}
