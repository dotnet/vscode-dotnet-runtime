/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';

export interface IModalEventRepublisher extends IEventStreamObserver
{
    post(event: IEvent): void;
    dispose(): void;
}
