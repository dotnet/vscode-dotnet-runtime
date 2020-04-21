/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { Memento } from 'vscode';
import { IEventStream } from '../EventStream/EventStream';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IInstallationValidator } from './IInstallationValidator';
import { IVersionResolver } from './IVersionResolver';

export interface IAcquisitionWorkerContext {
    storagePath: string;
    extensionState: Memento;
    eventStream: IEventStream;
    acquisitionInvoker: IAcquisitionInvoker;
    versionResolver: IVersionResolver;
    installationValidator: IInstallationValidator;
    timeoutValue: number;
}
