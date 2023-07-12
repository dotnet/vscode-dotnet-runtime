/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { GlobalInstallerResolver } from './GlobalInstallerResolver';

export interface IDotnetCoreAcquisitionWorker {
    uninstallAll(): void;

    acquireRuntime(version: string): Promise<IDotnetAcquireResult>;

    acquireSDK(version: string): Promise<IDotnetAcquireResult>;

    acquireGlobalSDK(installerResolver: GlobalInstallerResolver): Promise<IDotnetAcquireResult>;
}
