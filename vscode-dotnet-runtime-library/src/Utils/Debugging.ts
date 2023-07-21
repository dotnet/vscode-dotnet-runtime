/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IEventStream } from '../EventStream/EventStream';
import {
    DotnetDebuggingMessage,
} from '../EventStream/EventStreamEvents';
/**
 * A simple wrapper around console logging that can disable / enable all debugging or logging messages.
 */
export class Debugging {
    static debugOn = true;
    static logToVS = true;

    public static log(message : string, eventStream : IEventStream | null = null)
    {
        if(Debugging.debugOn)
        {
            if(Debugging.logToVS)
            {
                eventStream?.post(new DotnetDebuggingMessage(message));
            }
            else
            {
                console.log(message);
            }
        }
        else
        {
            ; // do nothing to appease ansync?
        }
    }
};
