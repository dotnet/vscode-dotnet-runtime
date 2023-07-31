/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import path = require('path');
import { IEventStream } from '../EventStream/EventStream';
import {
    DotnetDebuggingMessage,
} from '../EventStream/EventStreamEvents';
import * as fs from 'fs';


/**
 * A simple wrapper around console logging that can disable / enable all debugging or logging messages.
 */
export class Debugging
{
    static logFile = path.join('C:', 'VsDotnetDebuggingLog.txt');
    static debugOn = true;
    static logToVS = true;
    static logToFile = true;

    public static log(message : string, eventStream : IEventStream | null = null)
    {
        if(Debugging.debugOn)
        {
            if(Debugging.logToVS)
            {
                eventStream?.post(new DotnetDebuggingMessage(message));
            }
            
            console.log(message);
            

            if(Debugging.logFile)
            
            {
                console.log(`Writing to ${Debugging.logFile}`);
                if(Debugging.logToVS)
                {
                    eventStream?.post(new DotnetDebuggingMessage(`Writing to ${Debugging.logFile}`));
                }

                const file = fs.createWriteStream(Debugging.logFile, { flags: 'a+' });
                file.write(message);
            }
        }
        else
        {
            ; // do nothing to appease ansync?
        }
    }
};
