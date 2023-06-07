/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IEventStream } from '../EventStream/EventStream';
import { ILoggingObserver } from '../EventStream/ILoggingObserver';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { ErrorConfiguration } from './ErrorHandler';
import { IExtensionConfigurationWorker } from './IExtensionConfigurationWorker';

export interface IIssueContext {
    logger: ILoggingObserver;
    errorConfiguration: ErrorConfiguration;
    displayWorker: IWindowDisplayWorker;
    extensionConfigWorker: IExtensionConfigurationWorker;
    eventStream: IEventStream;
    commandName: string;
    version: string | undefined;
    timeoutInfoUrl: string;
    moreInfoUrl: string;
}
