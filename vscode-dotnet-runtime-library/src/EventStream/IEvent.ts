/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { sanitizeProperties } from '../Utils/ContentSantizer';
import { EventType } from './EventType';

export abstract class IEvent {
    public abstract type: EventType;

    public abstract readonly eventName: string;

    public isError = false;

    public abstract getProperties(telemetry?: boolean): { [key: string]: string } | undefined;

    public getSanitizedProperties(): { [key: string]: string } | undefined {
        return sanitizeProperties(this.getProperties(true));
    }
}
