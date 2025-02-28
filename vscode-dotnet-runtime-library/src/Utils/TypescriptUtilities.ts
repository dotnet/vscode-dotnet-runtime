/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as proc from 'child_process';
import * as os from 'os';

import { IEventStream } from '../EventStream/EventStream';
import { DotnetWSLCheckEvent, DotnetWSLOperationOutputEvent } from '../EventStream/EventStreamEvents';
import { IEvent } from '../EventStream/IEvent';
import { ICommandExecutor } from './ICommandExecutor';
import { CommandExecutor } from './CommandExecutor';
import { SYSTEM_INFORMATION_CACHE_DURATION_MS } from '../Acquisition/CacheTimeConstants';

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
export function isRunningUnderWSL(eventStream?: IEventStream): boolean
{
    // See https://github.com/microsoft/WSL/issues/4071 for evidence that we can rely on this behavior.

    eventStream?.post(new DotnetWSLCheckEvent(`Checking if system is WSL. OS: ${os.platform()}`));

    if (os.platform() !== 'linux')
    {
        return false;
    }

    const command = 'grep';
    const args = ['-i', 'Microsoft', '/proc/version'];
    const commandResult = proc.spawnSync(command, args);

    eventStream?.post(new DotnetWSLOperationOutputEvent(`The output of the WSL check:
stdout: ${commandResult.stdout?.toString()}
stderr: ${commandResult.stderr?.toString()}
status: ${commandResult.status?.toString()}`
    ));

    if (!commandResult || !commandResult.stdout)
    {
        return false;
    }

    return commandResult.stdout.toString() !== '';
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