/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { sanitizeProperties } from '../Utils/ContentSantizer';
import { EventType } from './EventType';

export abstract class IEvent {
    public abstract type: EventType;

    public abstract readonly eventName: string;

    public abstract getProperties(telemetry?: boolean): { [key: string]: string } | undefined;

    public getSanitizedProperties(): { [key: string]: string } | undefined {
        return sanitizeProperties(this.getProperties(true));
    }
}
