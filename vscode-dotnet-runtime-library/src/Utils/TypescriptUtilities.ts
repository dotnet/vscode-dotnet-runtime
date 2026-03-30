/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as os from 'os';
import { SYSTEM_INFORMATION_CACHE_DURATION_MS } from '../Acquisition/CacheTimeConstants';
import type { DistroVersionPair } from '../Acquisition/LinuxVersionResolver';
import { RED_HAT_DISTRO_INFO_KEY, UBUNTU_DISTRO_INFO_KEY } from '../Acquisition/StringConstants';
import { IEventStream } from '../EventStream/EventStream';
import { DotnetWSLCheckEvent } from '../EventStream/EventStreamEvents';
import { IEvent } from '../EventStream/IEvent';
import { CommandExecutor } from './CommandExecutor';
import { EventStreamNodeIPCMutexLoggerWrapper } from './EventStreamNodeIPCMutexWrapper';
import { FileUtilities } from './FileUtilities';
import { ICommandExecutor } from './ICommandExecutor';
import { NodeIPCMutex } from './NodeIPCMutex';

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

export async function executeWithLock<A extends any[], R>(eventStream: IEventStream, alreadyHoldingLock: boolean, lockId: string, retryTimeMs: number, timeoutTimeMs: number, f: (...args: A) => R, ...args: A): Promise<R>
{
    // Are we in a mutex-relevant inner function call, that is called by a parent function that already holds the lock?
    // If so, we don't need to acquire the lock again and we also shouldn't release it as the parent function will do that.
    if (alreadyHoldingLock || process.env.VSCODE_DOTNET_RUNTIME_DISABLE_MUTEX === 'true')
    {

        return f(...(args));
    }
    else
    {
        const logger = new EventStreamNodeIPCMutexLoggerWrapper(eventStream, lockId);
        const mutex = new NodeIPCMutex(lockId, logger, `The lock may be held by another process or instance of vscode. Try restarting your machine, deleting the lock, and or increasing the timeout time in the extension settings.

Increase your OS path length limit to at least 256 characters.
On Linux, you can set XDG_RUNTIME_DIR to be a writeable directory by your user.

If you still face issues, set VSCODE_DOTNET_RUNTIME_DISABLE_MUTEX=true in the environment.
Report this issue to our vscode-dotnet-runtime GitHub for help.`
        );

        const result = await mutex.acquire(async () =>
        {
            // await must be used to make the linter allow f to be async, which it must be.

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

// All distros that Microsoft officially supports for this tool. Community distros (e.g. Debian) are not in this list.
export const microsoftSupportedDistroIds = [RED_HAT_DISTRO_INFO_KEY, UBUNTU_DISTRO_INFO_KEY];

/**
 * Checks if the system is running under WSL.
 * Checks env vars first, then falls back to /proc/version.
 * @param eventStream Optional event stream for diagnostic logging.
 */
export async function isRunningUnderWSL(eventStream?: IEventStream): Promise<boolean>
{
    eventStream?.post(new DotnetWSLCheckEvent(`Checking if system is WSL. OS: ${os.platform()}`));

    if (os.platform() !== 'linux')
    {
        return false;
    }

    if (process.env.WSL_DISTRO_NAME || process.env.WSLENV)
    {
        return true;
    }

    try
    {
        const procVersion = await new FileUtilities().read('/proc/version');
        return procVersion.toLowerCase().includes('microsoft');
    }
    catch
    {
        return false;
    }
}

/**
 * Detects the Linux distro and version from /etc/os-release.
 * @param eventStream Optional event stream for diagnostic logging.
 * @returns The distro name and version, or null if it can't be determined.
 */
export async function getRunningDistro(eventStream?: IEventStream): Promise<DistroVersionPair | null>
{
    if (os.platform() !== 'linux')
    {
        return null;
    }

    const mainOSDeclarationFile = `/etc/os-release`;
    // Fallback per https://man7.org/linux/man-pages/man5/os-release.5.html
    const backupOSDeclarationFile = `/usr/lib/os-release`;
    const fileUtils = new FileUtilities();
    const osDeclarationFile = await fileUtils.exists(mainOSDeclarationFile) ? mainOSDeclarationFile : backupOSDeclarationFile;

    try
    {
        const osInfo = (await fileUtils.read(osDeclarationFile)).split('\n');
        const infoWithQuotesRemoved = osInfo.map(x => x.replace('"', ''));
        const infoWithSeparatedKeyValues = infoWithQuotesRemoved.map(x => x.split('='));
        const keyValueMap = Object.fromEntries(infoWithSeparatedKeyValues.map(x => [x[0], x[1]]));

        const distroName: string = keyValueMap.NAME?.replace('"', '') ?? '';
        const distroVersion: string = keyValueMap.VERSION_ID?.replace('"', '') ?? '';

        if (distroName === '' || distroVersion === '')
        {
            return null;
        }

        return { distro: distroName, version: distroVersion };
    }
    catch
    {
        return null;
    }
}

/**
 * Checks if the given distro (or the current running distro) is in microsoftSupportedDistroIds.
 * @param distro Optional distro to check. If not provided, detects the current distro.
 * @param eventStream Optional event stream for diagnostic logging.
 */
export async function isDistroSupported(distro?: DistroVersionPair | null, eventStream?: IEventStream): Promise<boolean>
{
    const resolvedDistro = distro ?? await getRunningDistro(eventStream);
    if (!resolvedDistro || resolvedDistro.distro === '')
    {
        return false;
    }
    return microsoftSupportedDistroIds.includes(resolvedDistro.distro);
}

/**
 * Checks for WSL or non-Microsoft-supported Linux distro.
 * Returns { isUnsupported: true, reason } if on WSL or a community/unsupported distro.
 * Note: the extension itself can still install on community distros (e.g. Debian via DebianDistroSDKProvider).
 * This method is intended for LM tools that should not attempt community-support installs.
 * @param eventStream Optional event stream for diagnostic logging.
 */
export async function checkForUnsupportedLinux(eventStream?: IEventStream): Promise<{ isUnsupported: boolean; reason?: string }>
{
    if (os.platform() !== 'linux')
    {
        return { isUnsupported: false };
    }

    if (await isRunningUnderWSL(eventStream))
    {
        return { isUnsupported: true, reason: 'WSL' };
    }

    if (!await isDistroSupported(undefined, eventStream))
    {
        return { isUnsupported: true, reason: 'Linux Distro' };
    }

    return { isUnsupported: false };
}