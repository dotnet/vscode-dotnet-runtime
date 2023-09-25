/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IEvent } from '../EventStream/IEvent';
import { IEventStreamObserver } from '../EventStream/IEventStreamObserver';

export interface ILoggingObserver extends IEventStreamObserver {
    post(event: IEvent): void;
    dispose(): void;
    getFileLocation(): string;
}
