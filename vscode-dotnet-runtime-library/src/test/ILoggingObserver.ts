/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IEvent } from '../EventStream/IEvent';
import { IEventStreamObserver } from '../EventStream/IEventStreamObserver';

export interface ILoggingObserver extends IEventStreamObserver {
    post(event: IEvent): void;
    dispose(): void;
    getFileLocation(): string;
}
