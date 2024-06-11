/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { GlobalInstallerResolver } from './GlobalInstallerResolver';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';

export interface IDotnetCoreAcquisitionWorker
{
    uninstallAll(eventStream : IEventStream, storagePath : string): void;

    acquireRuntime(context: IAcquisitionWorkerContext, invoker : IAcquisitionInvoker): Promise<IDotnetAcquireResult>;

    acquireSDK(context: IAcquisitionWorkerContext, invoker : IAcquisitionInvoker): Promise<IDotnetAcquireResult>;

    acquireGlobalSDK(context: IAcquisitionWorkerContext, installerResolver: GlobalInstallerResolver): Promise<IDotnetAcquireResult>;
}
