/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { GlobalInstallerResolver } from './GlobalInstallerResolver';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';

export interface IDotnetCoreAcquisitionWorker
{
    uninstallAll(): void;

    uninstallLocal(installKey : string) : Promise<void>;

    getExistingLocalRuntimes() : Promise<string[]>;

    acquireRuntime(version: string, invoker : IAcquisitionInvoker): Promise<IDotnetAcquireResult>;

    acquireSDK(version: string, invoker : IAcquisitionInvoker): Promise<IDotnetAcquireResult>;

    acquireGlobalSDK(installerResolver: GlobalInstallerResolver): Promise<IDotnetAcquireResult>;
}
