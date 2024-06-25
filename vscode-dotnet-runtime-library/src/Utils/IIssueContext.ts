/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
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
