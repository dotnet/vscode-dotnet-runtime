/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as os from 'os';

import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { SYSTEM_INFORMATION_CACHE_DURATION_MS } from '../Acquisition/CacheTimeConstants';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { IEventStream } from '../EventStream/EventStream';
import
{
    DotnetLockAttemptingAcquireEvent,
    DotnetLockErrorEvent,
    DotnetLockReleasedEvent, DotnetWSLCheckEvent, EventBasedError
} from '../EventStream/EventStreamEvents';
import { IEvent } from '../EventStream/IEvent';
import { CommandExecutor } from './CommandExecutor';
import { ICommandExecutor } from './ICommandExecutor';
import { IUtilityContext } from './IUtilityContext';
import { LockUsedByThisInstanceSingleton } from './LockUsedByThisInstanceSingleton';

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

/*
@remarks lockPath should be a full path to a shared lock file ending in .lock (that may or may not exist on disk) and the file content does not matter
*/
export async function executeWithLock<A extends any[], R>(eventStream: IEventStream, alreadyHoldingLock: boolean, lockPath: string, retryTimeMs: number, timeoutTimeMs: number, f: (...args: A) => R, ...args: A): Promise<R>
{
    // Are we in a mutex-relevant inner function call, that is called by a parent function that already holds the lock?
    // If so, we don't need to acquire the lock again and we also shouldn't release it as the parent function will do that.
    if (alreadyHoldingLock)
    {
        // eslint-disable-next-line @typescript-eslint/await-thenable
        return f(...(args));
    }

    // Someone PKilled Vscode while we held the lock previously. Need to clean up the lock created by the lib (lib adds .lock unless you use LockFilePath option)
    if (fs.existsSync(`${lockPath}.lock`) && !(LockUsedByThisInstanceSingleton.getInstance().hasVsCodeInstanceInteractedWithLock(lockPath)))
    {
        await lockfile.unlock(lockPath);
    }

    retryTimeMs = retryTimeMs > 0 ? retryTimeMs : 100;
    const retryCountToEndRoughlyAtTimeoutMs = timeoutTimeMs / retryTimeMs;
    let returnResult: any;
    let codeFailureAndNotLockFailure = null;

    // Make the directory and file to hold a lock over if it DNE. If it exists, thats OK (.lock is a different file than the lock file)
    try
    {
        fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    }
    catch (err)
    {
        // The file owning directory already exists
    }

    eventStream?.post(new DotnetLockAttemptingAcquireEvent(`Lock Acquisition request to begin.`, new Date().toISOString(), lockPath, lockPath));
    fs.writeFileSync(lockPath, '', { encoding: 'utf-8' });
    await lockfile.lock(lockPath, { stale: (timeoutTimeMs - (retryTimeMs * 2)) /*if a proc holding the lock has not returned in the stale time it will auto fail*/, retries: { retries: retryCountToEndRoughlyAtTimeoutMs, minTimeout: retryTimeMs, maxTimeout: retryTimeMs } })
        .then(async (release) =>
        {
            try
            {
                // eslint-disable-next-line @typescript-eslint/await-thenable
                returnResult = await f(...(args));
            }
            catch (errorFromF: any)
            {
                codeFailureAndNotLockFailure = errorFromF;
            }
            eventStream?.post(new DotnetLockReleasedEvent(`Lock about to be released.`, new Date().toISOString(), lockPath, lockPath));
            return release();
        })
        .catch(async (lockingError: Error) =>
        {
            // If we don't catch here, the lock will never be released.
            try
            {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                eventStream.post(new DotnetLockErrorEvent(lockingError, lockingError?.message ?? 'Unable to acquire lock or unlock lock. Trying to unlock.', new Date().toISOString(), lockPath, lockPath));
            }
            catch (eWhenUnlocking: any)
            {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                eventStream.post(new DotnetLockErrorEvent(eWhenUnlocking, eWhenUnlocking?.message ?? 'Unable to unlock lock after retry.', new Date().toISOString(), lockPath, lockPath));
            }
            throw new EventBasedError('DotnetLockErrorEvent', lockingError?.message, lockingError?.stack);
        });

    if (codeFailureAndNotLockFailure)
    {
        throw codeFailureAndNotLockFailure;
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