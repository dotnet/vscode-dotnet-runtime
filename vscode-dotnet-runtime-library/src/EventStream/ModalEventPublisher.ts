/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { DotnetAcquisitionStarted, DotnetASPNetRuntimeAcquisitionStarted, DotnetRuntimeAcquisitionStarted, DotnetSDKAcquisitionStarted, GenericModalEvent } from '..';
import { IEventStream } from './EventStream';
import { IEvent } from './IEvent';
import { IModalEventRepublisher } from './IModalEventPublisher';

export class ModalEventRepublisher implements IModalEventRepublisher {

    constructor(protected readonly eventStreamReference : IEventStream) {}

    private getSpecificEvent(event : GenericModalEvent) : IEvent
    {
        const mode = event.mode;
        const args = event.innerEventArgs;

        if(event instanceof DotnetAcquisitionStarted)
        {
            switch(mode)
            {
              case 'sdk':
                return new DotnetSDKAcquisitionStarted(args);
              case 'runtime':
                return new DotnetRuntimeAcquisitionStarted(args);
              case 'aspnetcore':
                return new DotnetASPNetRuntimeAcquisitionStarted(args);
              default:
                break;
            }
        }
    }

    private republishEvent(event : GenericModalEvent) : void
    {
        const modeSpecificEvent = this.getSpecificEvent(event);
        this.eventStreamReference.post(modeSpecificEvent);
    }

    public post(event: IEvent): void
    {
        if(event instanceof GenericModalEvent)
        {
            this.republishEvent(event);
        }
    }

    public dispose(): void
    {
    }
}
