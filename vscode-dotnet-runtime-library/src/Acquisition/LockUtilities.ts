/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as lockfile from 'proper-lockfile';
import * as path from 'path';
import {
    DotnetLockAttemptingAcquireEvent,
    DotnetLockErrorEvent,
    DotnetLockReleasedEvent,
    EventBasedError,
} from '../EventStream/EventStreamEvents';
import { IEventStream } from '../EventStream/EventStream';

export async function executeWithLock<A extends any[], R>(eventStream : IEventStream, alreadyHoldingLock : boolean, dataKey : string, f: (...args: A) => R, ...args: A): Promise<R>
{
    const trackingLock = `${dataKey}.lock`;
    const lockPath = path.join(__dirname, trackingLock);
    fs.writeFileSync(lockPath, '', 'utf-8');

    let returnResult : any;

    try
    {
        if(alreadyHoldingLock)
        {
            // eslint-disable-next-line @typescript-eslint/await-thenable
            return await f(...(args));
        }
        else
        {
            eventStream?.post(new DotnetLockAttemptingAcquireEvent(`Lock Acquisition request to begin.`, new Date().toISOString(), lockPath, lockPath));
            await lockfile.lock(lockPath, { retries: { retries: 10, minTimeout: 5, maxTimeout: 10000 } })
            .then(async (release) =>
            {
                // eslint-disable-next-line @typescript-eslint/await-thenable
                returnResult = await f(...(args));
                eventStream?.post(new DotnetLockReleasedEvent(`Lock about to be released.`, new Date().toISOString(), lockPath, lockPath));
                return release();
            })
            .catch((e : Error) =>
            {
                // Either the lock could not be acquired or releasing it failed
                eventStream?.post(new DotnetLockErrorEvent(e, e.message, new Date().toISOString(), lockPath, lockPath));
            });
        }
    }
    catch(e : any)
    {
        // Either the lock could not be acquired or releasing it failed

        // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        eventStream.post(new DotnetLockErrorEvent(e, e?.message ?? 'Unable to acquire lock to update installation state', new Date().toISOString(), lockPath, lockPath));

        // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        throw new EventBasedError('DotnetLockErrorEvent', e?.message, e?.stack);
    }

    return returnResult;
}
