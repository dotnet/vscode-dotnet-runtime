/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IEventStream } from '../EventStream/EventStream';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IExtensionState } from '../IExtensionState';
import { GlobalInstallerResolver } from './GlobalInstallerResolver';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';

export interface IDotnetCoreAcquisitionWorker
{
    uninstallAll(eventStream: IEventStream, storagePath: string, extensionState: IExtensionState): Promise<void>;

    acquireLocalRuntime(context: IAcquisitionWorkerContext, invoker: IAcquisitionInvoker): Promise<IDotnetAcquireResult>;

    acquireLocalASPNET(context: IAcquisitionWorkerContext, invoker: IAcquisitionInvoker): Promise<IDotnetAcquireResult>;

    acquireLocalSDK(context: IAcquisitionWorkerContext, invoker: IAcquisitionInvoker): Promise<IDotnetAcquireResult>;

    acquireGlobalSDK(context: IAcquisitionWorkerContext, installerResolver: GlobalInstallerResolver): Promise<IDotnetAcquireResult>;
}
