/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
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
}
