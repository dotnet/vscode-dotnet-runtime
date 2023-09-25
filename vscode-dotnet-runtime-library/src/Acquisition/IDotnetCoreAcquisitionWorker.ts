/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IDotnetAcquireResult } from '../IDotnetAcquireResult';

export interface IDotnetCoreAcquisitionWorker {
    uninstallAll(): void;

    acquireRuntime(version: string): Promise<IDotnetAcquireResult>;

    acquireSDK(version: string): Promise<IDotnetAcquireResult>;
}
