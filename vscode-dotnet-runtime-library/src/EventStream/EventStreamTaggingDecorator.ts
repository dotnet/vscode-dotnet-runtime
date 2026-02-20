/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as crypto from 'crypto';
import { IEventStream } from './EventStream';
import { IEvent } from './IEvent';

/**
 * An IEventStream wrapper that tags every posted event with a fixed commandId.
 * Use this to correlate all events that belong to the same acquisition action flow,
 * especially when multiple concurrent flows are interleaved in the log.
 */
export class EventStreamTaggingDecorator implements IEventStream
{
    public readonly commandId: string;

    constructor(private readonly inner: IEventStream, commandId?: string)
    {
        this.commandId = commandId ?? crypto.randomUUID();
    }

    public post(event: IEvent): void
    {
        event.commandId = this.commandId;
        this.inner.post(event);
    }
}
