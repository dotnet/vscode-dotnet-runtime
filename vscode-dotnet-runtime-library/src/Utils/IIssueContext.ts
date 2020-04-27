/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { ILoggingObserver } from '../EventStream/ILoggingObserver';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { ErrorConfiguration } from './Constants';

export interface IIssueContext {
    logger: ILoggingObserver;
    errorConfiguration: ErrorConfiguration;
    displayWorker: IWindowDisplayWorker;
}
