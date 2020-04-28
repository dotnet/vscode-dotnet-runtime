/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { UninstallErrorConfiguration } from './Utils/ErrorConstants';

export interface IDotnetUninstallContext {
    errorConfiguration?: UninstallErrorConfiguration;
}
