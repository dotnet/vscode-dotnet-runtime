/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
/**
 * A simple wrapper around console logging that can disable / enable all debugging or logging messages.
 */
export class Debugging {
    static debugOn = false;

    public static log(message : string)
    {
        if(Debugging.debugOn)
        {
            console.log(message);
        }
    }
};
