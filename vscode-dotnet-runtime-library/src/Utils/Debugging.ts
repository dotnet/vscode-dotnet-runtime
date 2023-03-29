/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

/**
 * A simple wrapper around console logging that can disable / enable all debugging or logging messages.
 */
export class Debugging {
    static debugOn = true;

    public static log(message : string)
    {
        if(Debugging.debugOn)
        {
            console.log(message);
        }
    }
};