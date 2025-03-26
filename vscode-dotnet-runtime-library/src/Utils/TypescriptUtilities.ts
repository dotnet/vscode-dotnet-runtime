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
    DotnetLockAcquiredEvent,
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
    eventStream: IEventStream | null, waitEvent: IEvent): Promise<void>
{
    for (let i = 0; i < (durationToWaitBeforeTimeoutMs / sampleRatePerMs); i++)
    {
        if (conditionToStop())
        {
            doAfterStop();
            return;
        }
        eventStream?.post(waitEvent);
        await new Promise(waitAndResolve => setTimeout(waitAndResolve, sampleRatePerMs));
    }
    throw new Error('The promise timed out.');
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
        eventStream?.post(new DotnetLockReleasedEvent(`Lock about to be released, but we never touched it (pkilled vscode?)`, new Date().toISOString(), lockPath, lockPath));

        if (lockfile.checkSync(lockPath))
        {
            eventStream?.post(new DotnetLockReleasedEvent(`Lock about to be released, and checkSync showed it.`, new Date().toISOString(), lockPath, lockPath));
            lockfile.unlockSync(lockPath);
        }
        else
        {
            eventStream?.post(new DotnetLockReleasedEvent(`Lock is not owned by us, delete it`, new Date().toISOString(), lockPath, lockPath));
            fs.rmdirSync(`${lockPath}.lock`, { recursive: true });
        }
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
            eventStream?.post(new DotnetLockAcquiredEvent(`Lock Acquired.`, new Date().toISOString(), lockPath, lockPath));
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
            return release().catch((unlockError: Error) => { if (unlockError.message.includes('already released') || unlockError.message.includes('by you')) { return; } else { throw unlockError; } }); // sometimes the lib will fail to release even if it never acquired it.
        })
        .catch((lockingError: Error) =>
        {
            // If we don't catch here, the lock will never be released.
            try
            {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                eventStream.post(new DotnetLockErrorEvent(lockingError, lockingError?.message ?? 'Unable to acquire lock or unlock lock. Trying to unlock.', new Date().toISOString(), lockPath, lockPath));
                if (lockfile.checkSync(lockPath))
                {
                    eventStream?.post(new DotnetLockReleasedEvent(`Lock about to be released after checkSync due to lockError Event`, new Date().toISOString(), lockPath, lockPath));
                    lockfile.unlockSync(lockPath);
                }
            }
            catch (eWhenUnlocking: any)
            {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                eventStream.post(new DotnetLockErrorEvent(eWhenUnlocking, eWhenUnlocking?.message ?? `Unable to acquire lock ${lockPath}`, new Date().toISOString(), lockPath, lockPath));
            }
            throw new EventBasedError('DotnetLockErrorEvent', lockingError?.message, lockingError?.stack);
        });

    if (codeFailureAndNotLockFailure)
    {
        throw codeFailureAndNotLockFailure;
    }

    return returnResult;
}

const possiblyUsefulUpperCaseEnvVars = new Set<string>([ // This is a local variable instead of in the function so it doesn't get recreated every time the function is called. I looked at compiled JS and didn't see it get optimized.
    'COMMONPROGRAMFILES',
    'COMMONPROGRAMFILES(x86)',
    'PATH',
    'SYSTEMROOT',
    'PROGRAMFILES',
    'POWERSHELL_DISTRIBUTION_CHANNEL',
    'PROCESSOR_IDENTIFIER',
    'PSMODULEPATH',
    'PROCESSOR_ARCHITECTURE',
    'VSCODE_CLI',
    'VSCODE_CODE_CACHE_PATH',
    'VSCODE_HANDLES_UNCAUGHT_ERRORS',
    'RESOLVEDLANGUAGE',
    'VSCODE_PID',
    'WINDIR',
    'DIRCMD',
    'TERM_PROGRAM_VERSION',
    'ALLUSERSPROFILE',
    'COMSPEC',
    'DOTNET_MULTILEVEL_LOOKUP',
    'ELECTRON_RUN_AS_NODE',
    'LANG',
    'HOME',
    'PATHEXT',
    'SHELL',
    'TERM',
    'PWD',
    'BASHOPTS',
    'SHELLOPTS',
    'PS1',
    'PS2',
    'DOTNET_INSTALL_TOOL_UNDER_TEST',
    'VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH',
    'DOTNET_ROOT',
    'DOTNET_ROOT_X86',
    'DOTNET_ROOT_X64',
    'DOTNET_ROOT(x86)',
    'DOTNET_CLI_UI_LANGUAGE',
    'CHCP',
    'DOTNET_NOLOGO',
    'DOTNET_HOST_PATH',
    'DOTNET_ROLL_FORWARD',
    'DOTNET_ROLL_FORWARD_TO_PRERELEASE',
    'DOTNET_ROLL_FORWARD_ON_NO_CANDIDATE_FX',
]);

/*
* @remarks Not intended for telemetry redaction -- PII must be handled correctly elsewhere by a telemetry system.
* This is intended for logging to the console or a log file where we don't want to write out sensitive information, but we do want information that is useful for debugging weird user situations.
*/
export function minimizeEnvironment(pathEnv: NodeJS.ProcessEnv): string
{
    let pathEnvString = ``;

    for (const key in pathEnv)
    {
        if (possiblyUsefulUpperCaseEnvVars.has(key.toUpperCase()))
        {
            pathEnvString += `${key}: ${pathEnv[key]}\n}`;
        }
    }
    return pathEnvString;
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