/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { exit } from 'process';
import { INodeIPCTestLogger, printWithLock } from '../unit/TestUtility';

process.on('message', async (msg: any) =>
{
    if (msg?.run)
    {
        const logger = new INodeIPCTestLogger(); // The logger passed is not a class but list of events.
        await printWithLock(process.argv[4], process.argv[2], Number(process.argv[3]), logger,
            async () =>
            {
                console.log(`Send update: ${logger.logs}`);
                process.send?.({ status: 'update', message: logger.logs });
                logger.logs = []; // Clear the logs to avoid sending the same message multiple times.
            }
        );
        exit(0);
    }
});