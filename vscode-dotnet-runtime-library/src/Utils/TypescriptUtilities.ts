/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as os from 'os';

import { IAcquisitionWorkerContext, IUtilityContext } from '..';
import { SYSTEM_INFORMATION_CACHE_DURATION_MS } from '../Acquisition/CacheTimeConstants';
import { IEventStream } from '../EventStream/EventStream';
import { DotnetWSLCheckEvent } from '../EventStream/EventStreamEvents';
import { IEvent } from '../EventStream/IEvent';
import { CommandExecutor } from './CommandExecutor';
import { ICommandExecutor } from './ICommandExecutor';

export async function loopWithTimeoutOnCond(sampleRatePerMs: number, durationToWaitBeforeTimeoutMs: number, conditionToStop: () => boolean, doAfterStop: () => void,
    eventStream: IEventStream, waitEvent: IEvent)
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
            eventStream.post(waitEvent);
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