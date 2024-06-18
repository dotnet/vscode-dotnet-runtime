/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import
{
  DotnetAcquisitionFinalError,
  DotnetAcquisitionStarted,
  DotnetAcquisitionTotalSuccessEvent,
  DotnetASPNetRuntimeAcquisitionStarted,
  DotnetASPNetRuntimeAcquisitionTotalSuccessEvent,
  DotnetASPNetRuntimeFinalAcquisitionError,
  DotnetGlobalSDKAcquisitionError,
  DotnetGlobalSDKAcquisitionTotalSuccessEvent,
  DotnetRuntimeAcquisitionStarted,
  DotnetRuntimeAcquisitionTotalSuccessEvent,
  DotnetRuntimeFinalAcquisitionError,
  DotnetSDKAcquisitionStarted,
  GenericModalEvent
} from '../EventStream/EventStreamEvents';
import { IEventStream } from './EventStream';
import { IEvent } from './IEvent';
import { IModalEventRepublisher } from './IModalEventPublisher';

export class ModalEventRepublisher implements IModalEventRepublisher
{
    constructor(protected readonly eventStreamReference : IEventStream) {}

    private getSpecificEvent(event : GenericModalEvent) : IEvent | null
    {
        const mode = event.mode;

        if(event instanceof DotnetAcquisitionStarted)
        {
            switch(mode)
            {
              case 'sdk':
                return new DotnetSDKAcquisitionStarted(event.requestingExtensionId);
              case 'runtime':
                return new DotnetRuntimeAcquisitionStarted(event.requestingExtensionId);
              case 'aspnetcore':
                return new DotnetASPNetRuntimeAcquisitionStarted(event.requestingExtensionId);
              default:
                break;
            }
        }
        else if(event instanceof DotnetAcquisitionTotalSuccessEvent)
        {
          switch(mode)
          {
            case 'sdk':
              return new DotnetGlobalSDKAcquisitionTotalSuccessEvent(event.install);
            case 'runtime':
              return new DotnetRuntimeAcquisitionTotalSuccessEvent(event.install);
            case 'aspnetcore':
              return new DotnetASPNetRuntimeAcquisitionTotalSuccessEvent(event.install);
            default:
              break;
          }
        }
        else if(event instanceof DotnetAcquisitionFinalError)
        {
          switch(mode)
          {
            case 'sdk':
              return new DotnetGlobalSDKAcquisitionError(event.error, event.originalEventName, event.install);
            case 'runtime':
              return new DotnetRuntimeFinalAcquisitionError(event.error, event.originalEventName, event.install);
            case 'aspnetcore':
              return new DotnetASPNetRuntimeFinalAcquisitionError(event.error, event.originalEventName, event.install);
            default:
              break;
          }
        }

        return null;
    }

    private republishEvent(event : GenericModalEvent) : void
    {
        const modeSpecificEvent = this.getSpecificEvent(event);
        if(modeSpecificEvent !== null)
        {
          this.eventStreamReference.post(modeSpecificEvent);
        }
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
