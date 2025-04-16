/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as os from 'os';
import { SYSTEM_INFORMATION_CACHE_DURATION_MS } from '../Acquisition/CacheTimeConstants';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { IEventStream } from '../EventStream/EventStream';
import
{
    DotnetWSLCheckEvent,
    GenericDotnetLockEvent
} from '../EventStream/EventStreamEvents';
import { IEvent } from '../EventStream/IEvent';
import { CommandExecutor } from './CommandExecutor';
import { ICommandExecutor } from './ICommandExecutor';
import { IUtilityContext } from './IUtilityContext';
import { INodeIPCMutexLogger, NodeIPCMutex } from './NodeIPCMutex';

export async function loopWithTimeoutOnCond(sampleRatePerMs: number, durationToWaitBeforeTimeoutMs: number, conditionToStop: () => boolean, doAfterStop: () => void,
    eventStream: IEventStream | null, waitEvent: IEvent): Promise<void>
{
    for (let i = 0; i < (durationToWaitBeforeTimeoutMs / sampleRatePerMs); i++)
    {
        if (conditionToStop())
        {
            doAfterStop();
            return Promise.resolve();
        }
        eventStream?.post(waitEvent);
        await new Promise(waitAndResolve => setTimeout(waitAndResolve, sampleRatePerMs));
    }
    throw new Error(`The promise timed out at ${durationToWaitBeforeTimeoutMs}.`);
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

export async function executeWithLock<A extends any[], R>(eventStream: IEventStream, alreadyHoldingLock: boolean, lockId: string, retryTimeMs: number, timeoutTimeMs: number, f: (...args: A) => R, ...args: A): Promise<R>
{
    // Are we in a mutex-relevant inner function call, that is called by a parent function that already holds the lock?
    // If so, we don't need to acquire the lock again and we also shouldn't release it as the parent function will do that.
    if (alreadyHoldingLock || process.env.VSCODE_DOTNET_RUNTIME_DISABLE_MUTEX === 'true')
    {
        // eslint-disable-next-line @typescript-eslint/await-thenable
        return f(...(args));
    }
    else
    {
        class NodeIPCMutexLoggerWrapper extends INodeIPCMutexLogger
        {
            constructor(private readonly loggerEventStream: IEventStream)
            {
                super();
            }
            public log(message: string)
            {
                this.loggerEventStream.post(new GenericDotnetLockEvent(message, new Date().toISOString(), lockId, lockId));
            }
        }

        const logger = new NodeIPCMutexLoggerWrapper(eventStream);
        const mutex = new NodeIPCMutex(lockId, logger, `The lock may be held by another process or instance of vscode. Try restarting your machine, deleting the lock, and or increasing the timeout time in the extension settings.

Increase your OS path length limit to at least 256 characters.
On Linux, you can set XDG_RUNTIME_DIR to be a writeable directory by your user.

If you still face issues, set VSCODE_DOTNET_RUNTIME_DISABLE_MUTEX=true in the environment.
Report this issue to our vscode-dotnet-runtime GitHub for help.`
        );

        const result = await mutex.acquire(async () =>
        {
            // await must be used to make the linter allow f to be async, which it must be.
            // eslint-disable-next-line no-return-await
            return await f(...(args));
        }, retryTimeMs, timeoutTimeMs, `${lockId}-${crypto.randomUUID()}`);
        return result;
    }
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
            pathEnvString += `${key}: ${pathEnv[key]}\n`;
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