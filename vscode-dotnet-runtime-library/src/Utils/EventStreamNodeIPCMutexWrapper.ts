/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IEventStream } from '../EventStream/EventStream';
import { GenericDotnetLockEvent } from '../EventStream/EventStreamEvents';
import { INodeIPCMutexLogger } from './NodeIPCMutex';

export class EventStreamNodeIPCMutexLoggerWrapper extends INodeIPCMutexLogger
{
    constructor(private readonly loggerEventStream: IEventStream, private readonly lockId: string)
    {
        super();
    }
    public log(message: string)
    {
        this.loggerEventStream.post(new GenericDotnetLockEvent(message, new Date().toISOString(), this.lockId, this.lockId));
    }
}