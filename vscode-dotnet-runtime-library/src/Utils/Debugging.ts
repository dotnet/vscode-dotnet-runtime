/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import path = require('path');
import { IEventStream } from '../EventStream/EventStream';
import {
    DotnetDebuggingMessage,
} from '../EventStream/EventStreamEvents';
import * as fs from 'fs';

/**
 * A simple wrapper around console logging that can disable / enable all debugging or logging messages.
 * Use EventStreamEvents for user facing debugging logs.
 */
export class Debugging
{
    static logFile = path.join(__dirname, 'VsDotnetDebuggingLog.txt');
    static debugOn = false;
    static logToTerminal = true;
    static logToFile = true;

    public static log(message : string, eventStream : IEventStream | null = null)
    {
        if(Debugging.debugOn)
        {
            if(Debugging.logToTerminal)
            {
                eventStream?.post(new DotnetDebuggingMessage(message));
            }

            console.log(message);


            if(Debugging.logFile)

            {
                console.log(`Writing to ${Debugging.logFile}`);
                if(Debugging.logToTerminal)
                {
                    eventStream?.post(new DotnetDebuggingMessage(`Writing to ${Debugging.logFile}`));
                }

                const file = fs.createWriteStream(Debugging.logFile, { flags: 'a+' });
                file.write(message);
            }
        }
    }
};
