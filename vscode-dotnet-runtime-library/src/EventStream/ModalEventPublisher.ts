/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import
{
  DotnetAcquisitionFinalError,
  DotnetAcquisitionRequested,
  DotnetAcquisitionStarted,
  DotnetAcquisitionTotalSuccessEvent,
  DotnetASPNetRuntimeAcquisitionRequested,
  DotnetASPNetRuntimeAcquisitionStarted,
  DotnetASPNetRuntimeAcquisitionTotalSuccessEvent,
  DotnetASPNetRuntimeFinalAcquisitionError,
  DotnetGlobalSDKAcquisitionError,
  DotnetGlobalSDKAcquisitionRequested,
  DotnetGlobalSDKAcquisitionStarted,
  DotnetGlobalSDKAcquisitionTotalSuccessEvent,
  DotnetRuntimeAcquisitionRequested,
  DotnetRuntimeAcquisitionStarted,
  DotnetRuntimeAcquisitionTotalSuccessEvent,
  DotnetRuntimeFinalAcquisitionError,
  GenericModalEvent
} from '../EventStream/EventStreamEvents';
import { IEventStream } from './EventStream';
import { IEvent } from './IEvent';
import { IModalEventRepublisher } from './IModalEventPublisher';

export class ModalEventRepublisher implements IModalEventRepublisher
{
  constructor(protected readonly eventStreamReference: IEventStream) {}

  private getSpecificEvent(event: GenericModalEvent): IEvent | null
  {
    const mode = event.mode;

    if (event instanceof DotnetAcquisitionStarted)
    {
      switch (mode)
      {
        case 'sdk':
          return event.installType === 'global' ? new DotnetGlobalSDKAcquisitionStarted(event.requestingExtensionId) : null;
        case 'runtime':
          return new DotnetRuntimeAcquisitionStarted(event.requestingExtensionId);
        case 'aspnetcore':
          return new DotnetASPNetRuntimeAcquisitionStarted(event.requestingExtensionId);
        default:
          break;
      }
    }
    else if (event instanceof DotnetAcquisitionTotalSuccessEvent)
    {
      switch (mode)
      {
        case 'sdk':
          return event.installType === 'global' ? new DotnetGlobalSDKAcquisitionTotalSuccessEvent(event.install) : null;
        case 'runtime':
          return new DotnetRuntimeAcquisitionTotalSuccessEvent(event.install);
        case 'aspnetcore':
          return new DotnetASPNetRuntimeAcquisitionTotalSuccessEvent(event.install);
        default:
          break;
      }
    }
    else if (event instanceof DotnetAcquisitionFinalError)
    {
      switch (mode)
      {
        case 'sdk':
          return event.installType === 'global' ? new DotnetGlobalSDKAcquisitionError(event.error, event.originalEventName, event.install) : null;
        case 'runtime':
          return new DotnetRuntimeFinalAcquisitionError(event.error, event.originalEventName, event.install);
        case 'aspnetcore':
          return new DotnetASPNetRuntimeFinalAcquisitionError(event.error, event.originalEventName, event.install);
        default:
          break;
      }
    }
    else if (event instanceof DotnetAcquisitionRequested)
    {
      switch (mode)
      {
        case 'sdk':
          return event.installType === 'global' ? new DotnetGlobalSDKAcquisitionRequested(event.startingVersion, event.requestingId, event.mode) : null;
        case 'runtime':
          return new DotnetRuntimeAcquisitionRequested(event.startingVersion, event.requestingId, event.mode);
        case 'aspnetcore':
          return new DotnetASPNetRuntimeAcquisitionRequested(event.startingVersion, event.requestingId, event.mode);
        default:
          break;
      }
    }

    return null;
  }

  private republishEvent(event: GenericModalEvent): void
  {
    const modeSpecificEvent = this.getSpecificEvent(event);
    if (modeSpecificEvent)
    {
      this.eventStreamReference.post(modeSpecificEvent);
    }
  }

  public post(event: IEvent): void
  {
    if (event instanceof GenericModalEvent)
    {
      this.republishEvent(event);
    }
  }

  public dispose(): void
  {
  }
}
