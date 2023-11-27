/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IDotnetAcquireContext, IWindowDisplayWorker } from '..';
import { IEventStream } from '../EventStream/EventStream';
import { IExtensionState } from '../IExtensionState';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IInstallationDirectoryProvider } from './IInstallationDirectoryProvider';
import { IInstallationValidator } from './IInstallationValidator';

export interface IAcquisitionWorkerContext {
    storagePath: string;
    extensionState: IExtensionState;
    eventStream: IEventStream;
    acquisitionInvoker: IAcquisitionInvoker;
    installationValidator: IInstallationValidator;
    timeoutValue: number;
    installDirectoryProvider: IInstallationDirectoryProvider;
    acquisitionContext? : IDotnetAcquireContext | null;
    installingArchitecture? : string | undefined | null;
    proxyUrl? : string | undefined;
    isExtensionTelemetryInitiallyEnabled : boolean;
}
