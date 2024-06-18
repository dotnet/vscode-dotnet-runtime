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
        const args = event.innerEventArgs;

        if(event instanceof DotnetAcquisitionStarted)
        {
            switch(mode)
            {
              case 'sdk':
                return new DotnetSDKAcquisitionStarted(...(args));
              case 'runtime':
                return new DotnetRuntimeAcquisitionStarted(...(args));
              case 'aspnetcore':
                return new DotnetASPNetRuntimeAcquisitionStarted(...(args));
              default:
                break;
            }
        }
        /*else if(event instanceof DotnetAcquisitionTotalSuccessEvent)
        {
          switch(mode)
          {
            case 'sdk':
              return new DotnetGlobalSDKAcquisitionTotalSuccessEvent(...(args));
            case 'runtime':
              return new DotnetRuntimeAcquisitionTotalSuccessEvent(...(args));
            case 'aspnetcore':
              return new DotnetASPNetRuntimeAcquisitionTotalSuccessEvent(...(args));
            default:
              break;
          }
        }
        else if(event instanceof DotnetAcquisitionFinalError)
        {
          switch(mode)
          {
            case 'sdk':
              return new DotnetGlobalSDKAcquisitionError(...(args));
            case 'runtime':
              return new DotnetRuntimeFinalAcquisitionError(...(args));
            case 'aspnetcore':
              return new DotnetASPNetRuntimeFinalAcquisitionError(...(args));
            default:
              break;
          }
        }
*/
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
