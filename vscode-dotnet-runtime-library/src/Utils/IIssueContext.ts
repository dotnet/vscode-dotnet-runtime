/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { ILoggingObserver } from '../EventStream/ILoggingObserver';

export interface IIssueContext {
    logger: ILoggingObserver;
}
