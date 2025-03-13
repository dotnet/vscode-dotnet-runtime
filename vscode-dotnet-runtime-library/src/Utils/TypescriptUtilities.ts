/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as os from 'os';

import { SYSTEM_INFORMATION_CACHE_DURATION_MS } from '../Acquisition/CacheTimeConstants';
import { DotnetWSLCheckEvent } from '../EventStream/EventStreamEvents';
import { IEvent } from '../EventStream/IEvent';
import { CommandExecutor } from './CommandExecutor';
import { ICommandExecutor } from './ICommandExecutor';
import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { IEventStream } from '../EventStream/EventStream';
import
{
    DotnetLockAttemptingAcquireEvent,
    DotnetLockErrorEvent,
    DotnetLockReleasedEvent,
    EventBasedError,
} from '../EventStream/EventStreamEvents';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { IUtilityContext } from './IUtilityContext';

export async function loopWithTimeoutOnCond(sampleRatePerMs: number, durationToWaitBeforeTimeoutMs: number, conditionToStop: () => boolean, doAfterStop: () => void,
    eventStream: IEventStream | null, waitEvent: IEvent)
{
    return new Promise(async (resolve, reject) =>
    {
        for (let i = 0; i < (durationToWaitBeforeTimeoutMs / sampleRatePerMs); i++)
        {
            if (conditionToStop())
            {
                doAfterStop();
                return resolve('The promise succeeded.');
            }
            eventStream?.post(waitEvent);
            await new Promise(waitAndResolve => setTimeout(waitAndResolve, sampleRatePerMs));
        }

        return reject('The promise timed out.');
    });
}

/**
 * Returns true if the linux agent is running under WSL, else false.
 */
export async function isRunningUnderWSL(acquisitionContext: IAcquisitionWorkerContext, utilityContext: IUtilityContext, executor?: ICommandExecutor): Promise<boolean>
{
    // See https://github.com/microsoft/WSL/issues/4071 for evidence that we can rely on this behavior.

    acquisitionContext.eventStream?.post(new DotnetWSLCheckEvent(`Checking if system is WSL. OS: ${os.platform()}`));

    if (os.platform() !== 'linux')
    {
        return false;
    }

    const command = CommandExecutor.makeCommand('grep', ['-i', 'Microsoft', '/proc/version']);
    executor ??= new CommandExecutor(acquisitionContext, utilityContext);
    const commandResult = await executor.execute(command, {}, false);

    if (!commandResult || !commandResult.stdout)
    {
        return false;
    }

    return true;
}

export async function executeWithLock<A extends any[], R>(eventStream: IEventStream, alreadyHoldingLock: boolean, dataKey: string, f: (...args: A) => R, ...args: A): Promise<R>
{
    const trackingLock = `${dataKey}.lock`;
    const lockPath = path.join(__dirname, trackingLock);
    fs.writeFileSync(lockPath, '', 'utf-8');

    let returnResult: any;

    try
    {
        if (alreadyHoldingLock)
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
                .catch((e: Error) =>
                {
                    // Either the lock could not be acquired or releasing it failed
                    eventStream?.post(new DotnetLockErrorEvent(e, e.message, new Date().toISOString(), lockPath, lockPath));
                });
        }
    }
    catch (e: any)
    {
        // Either the lock could not be acquired or releasing it failed

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        eventStream.post(new DotnetLockErrorEvent(e, e?.message ?? 'Unable to acquire lock to update installation state', new Date().toISOString(), lockPath, lockPath));

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        throw new EventBasedError('DotnetLockErrorEvent', e?.message, e?.stack);
    }

    return returnResult;
}

export async function getOSArch(executor: ICommandExecutor): Promise<string>
{
    if (os.platform() === 'darwin')
    {
        const findTrueArchCommand = CommandExecutor.makeCommand(`uname`, [`-p`]);
        return (await executor.execute(findTrueArchCommand, { dotnetInstallToolCacheTtlMs: SYSTEM_INFORMATION_CACHE_DURATION_MS }, false)).stdout.toLowerCase().trim();
    }

    return os.arch();
}

export function getDotnetExecutable(): string
{
    return os.platform() === 'win32' ? 'dotnet.exe' : 'dotnet';
}

export function EnvironmentVariableIsDefined(variable: any): boolean
{
    // Most of the time this will be 'undefined', so this is the fastest check.
    return variable !== 'undefined' && variable !== null && variable !== '' && variable !== undefined;
}

export function getPathSeparator(): string
{
    return os.platform() === 'win32' ? ';' : ':';
}