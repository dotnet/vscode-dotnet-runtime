
/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as os from 'os';
import * as path from 'path';
import { DotnetFindPathNoRuntimesOnHost, DotnetUnableToCheckPATHArchitecture } from '../EventStream/EventStreamEvents';
import { LocalMemoryCacheSingleton } from '../LocalMemoryCacheSingleton';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { CommandExecutorCommand } from '../Utils/CommandExecutorCommand';
import { ExecutableArchitectureDetector } from '../Utils/ExecutableArchitectureDetector';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { getDotnetExecutable } from '../Utils/TypescriptUtilities';
import { DOTNET_INFORMATION_CACHE_DURATION_MS } from './CacheTimeConstants';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { DotnetInstallMode } from './DotnetInstallMode';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetListInfo } from './IDotnetListInfo';
import { IDotnetResolver } from './IDotnetResolver';

export class DotnetResolver implements IDotnetResolver
{
    public constructor(private readonly workerContext: IAcquisitionWorkerContext, private readonly utilityContext: IUtilityContext, private executor?: ICommandExecutor)
    {
        this.executor ??= new CommandExecutor(this.workerContext, this.utilityContext);
    }

    /**
     *
     * @param dotnetExecutablePath The path to the dotnet executable that contains installs of the runtimes and SDKs to search.
     * @param mode The mode to search for, either 'sdk' or 'runtime', or another mode.
     * @param requestedArchitecture The architecture to search for, or undefined to search based on the host architecture, falling back to the os.arch()
     * @returns An array of IDotnetListInfo objects representing the SDKs or runtimes installed on the system.
     */
    public async getDotnetInstalls(dotnetExecutablePath: string, mode: DotnetInstallMode, requestedArchitecture: string | undefined | null): Promise<IDotnetListInfo[]>
    {
        const oldLookup = process.env.DOTNET_MULTILEVEL_LOOKUP;
        // This is deprecated but still needed to scan .NET 6 and below
        process.env.DOTNET_MULTILEVEL_LOOKUP = '0'; // make it so --list-runtimes only finds the runtimes on that path: https://learn.microsoft.com/en-us/dotnet/core/compatibility/deployment/7.0/multilevel-lookup#reason-for-change

        try
        {
            if (mode === 'sdk')
            {
                const availableSDKs = await this.getSDKs(dotnetExecutablePath, requestedArchitecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture());
                const resolvedHostArchitecture = await this.resolveHostArchitecture(dotnetExecutablePath, availableSDKs, requestedArchitecture);

                if (requestedArchitecture && (resolvedHostArchitecture !== requestedArchitecture))
                {
                    return [];
                }

                // We request to the host to only return the installs that match the architecture for both sdks and runtimes, so they must match now
                return availableSDKs.map((sdk) =>
                {
                    return {
                        ...sdk,
                        architecture: resolvedHostArchitecture
                    };
                }) as IDotnetListInfo[];
            }
            else
            {
                // No need to consider SDKs when looking for runtimes as all the runtimes installed with the SDKs will be included in the runtimes list.
                const availableRuntimes = await this.getRuntimes(dotnetExecutablePath, requestedArchitecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture());
                const resolvedHostArchitecture = await this.resolveHostArchitecture(dotnetExecutablePath, availableRuntimes, requestedArchitecture);

                if (requestedArchitecture && (resolvedHostArchitecture !== requestedArchitecture))
                {
                    return [];
                }

                return availableRuntimes.map((runtime) =>
                {
                    return {
                        ...runtime,
                        architecture: resolvedHostArchitecture
                    };
                }) as IDotnetListInfo[];
            }
        }
        finally
        {
            // Restore the environment variable to its original value
            if (oldLookup !== undefined)
            {
                process.env.DOTNET_MULTILEVEL_LOOKUP = oldLookup;
            }
            else
            {
                delete process.env.DOTNET_MULTILEVEL_LOOKUP;
            }
        }
    }

    /**
     * Determines the architecture of the .NET installation.
     * @param dotnetExecutablePath The path to the dotnet executable - can be shell relative.
     * @param availableInstalls The list of available .NET installations to the executable.
     * @param requestedArchitecture The architecture requested by the user.
     * @returns The determined architecture or null if it could not be determined.
     */
    private async resolveHostArchitecture(dotnetExecutablePath: string, availableInstalls: IDotnetListInfo[], requestedArchitecture: string | null | undefined): Promise<string | null>
    {
        // Resolve the true path, so a path such as 'dotnet' can be resolved as a file to get the architecture of, without needing to call 'which' or 'where'
        const truePath = await this.resolveTruePath(dotnetExecutablePath, requestedArchitecture ?? null);

        // Try to get the arch in the most performant way
        const hostArch = new ExecutableArchitectureDetector().getExecutableArchitecture(truePath ?? dotnetExecutablePath);
        const knownArchitecture = ExecutableArchitectureDetector.IsKnownArchitecture(hostArch);

        if (knownArchitecture)
        {
            return hostArch;
        }
        else if (await this.hostSupportsArchFlag(truePath ?? dotnetExecutablePath, availableInstalls))
        {
            return requestedArchitecture ?? null;
        }
        else
        {
            return this.getHostArchitectureViaInfo(dotnetExecutablePath, requestedArchitecture);
        }
    }

    /**
     *
     * @param tentativePath The path to resolve.
     * @param suggestedArchitecture The architecture to resolve the paths for - this is only a suggestion and you must validate afterward
     * @returns The resolved true path or null if not found.
     */
    public async resolveTruePath(tentativePath: string, suggestedArchitecture: string | null): Promise<string | null>
    {
        const truePaths = await this.resolveTruePaths([tentativePath], suggestedArchitecture);
        return truePaths?.[0] ?? null;
    }

    /**
     *
     * @param tentativePaths Paths that may hold a dotnet executable.
     * @param suggestedArchitecture The architecture to resolve the paths for - this is only a suggestion and you must validate afterward
     * @returns The actual physical location/path on disk where the executables lie for each of the paths.
     * Some of the symlinks etc resolve to a path which works but is still not the actual path.
     */
    public async resolveTruePaths(tentativePaths: string[], suggestedArchitecture: string | null): Promise<string[]>
    {
        const oldLookup = process.env.DOTNET_MULTILEVEL_LOOKUP;
        // This is deprecated but still needed to scan .NET 6 and below
        process.env.DOTNET_MULTILEVEL_LOOKUP = '0'; // make it so --list-runtimes only finds the runtimes on that path: https://learn.microsoft.com/en-us/dotnet/core/compatibility/deployment/7.0/multilevel-lookup#reason-for-change

        try
        {
            const truePaths = [];
            suggestedArchitecture ??= DotnetCoreAcquisitionWorker.defaultArchitecture()

            for (const tentativePath of tentativePaths)
            {
                // This will even work if only the sdk is installed, list-runtimes on an sdk installed host would work
                const runtimeInfo = await this.getRuntimes(tentativePath, suggestedArchitecture);
                if ((runtimeInfo?.length ?? 0) > 0)
                {
                    // The .NET install layout is a well known structure on all platforms.
                    // See https://github.com/dotnet/designs/blob/main/accepted/2020/install-locations.md#net-core-install-layout
                    //
                    // Therefore we know that the runtime path is always in <install root>/shared/<runtime name>
                    // and the dotnet executable is always at <install root>/dotnet(.exe).
                    //
                    // Since dotnet --list-runtimes will always use the real assembly path to output the runtime folder (no symlinks!)
                    // we know the dotnet executable will be two folders up in the install root.
                    const truePath = path.join(path.dirname(path.dirname(runtimeInfo[0].directory)), getDotnetExecutable());
                    truePaths.push(truePath);

                    // Preload the cache with the calls we've already done.
                    // Example: 'dotnet' --list-runtimes will be the same as 'C:\\Program Files\\dotnet\\dotnet.exe' --list-runtimes
                    // If the dotnet executable full path was 'C:\\Program Files\\dotnet\\dotnet.exe'.

                    // We do NOT want to do this on Unix, because the dotnet executable is potentially polymorphic.
                    // /usr/local/bin/dotnet becomes /snap/dotnet-sdk/current/dotnet in reality, may have different behavior in shells.
                    if (os.platform() === 'win32')
                    {
                        LocalMemoryCacheSingleton.getInstance().aliasCommandAsAnotherCommandRoot(`"${truePath}"`, `"${tentativePath}"`, this.workerContext.eventStream);
                    }
                }
                else
                {
                    this.workerContext.eventStream.post(new DotnetFindPathNoRuntimesOnHost(`The host: ${tentativePath} does not contain a .NET runtime installation.`));
                }
            }

            return (truePaths?.length ?? 0) > 0 ? truePaths : tentativePaths;
        }
        finally
        {
            // Restore the environment variable to its original value
            if (oldLookup !== undefined)
            {
                process.env.DOTNET_MULTILEVEL_LOOKUP = oldLookup;
            }
            else
            {
                delete process.env.DOTNET_MULTILEVEL_LOOKUP;
            }
        }
    }

    /**
     *
     * @param hostPath The path to the dotnet executable
     * @returns The architecture of the dotnet host from the PATH, in dotnet info string format
     * The .NET Host will only list versions of the runtime and sdk that match its architecture.
     * Thus, any runtime or sdk that it prints out will be the same architecture as the host.
     * This information is not always accurate as dotnet info is subject to change.
     *
     * @remarks Will return '' if the architecture cannot be determined for some peculiar reason (e.g. dotnet --info is broken or changed).
     */
    // eslint-disable-next-line @typescript-eslint/require-await
    private async getHostArchitectureViaInfo(hostPath: string, expectedArchitecture?: string   | null): Promise<string>
    {
        // dotnet --info is not machine-readable and subject to breaking changes. See https://github.com/dotnet/sdk/issues/33697 and https://github.com/dotnet/runtime/issues/98735/
        // Unfortunately even with a new API, that might not go in until .NET 10 and beyond, so we have to rely on dotnet --info for now.

        if (!hostPath || hostPath === '""')
        {
            return '';
        }

        const infoCommand = CommandExecutor.makeCommand(`"${hostPath}"`, ['--info']);
        const envWithForceEnglish = process.env;
        envWithForceEnglish.DOTNET_CLI_UI_LANGUAGE = 'en-US';
        // System may not have english installed, but CDK already calls this without issue -- the .NET SDK language invocation is also wrapped by a runtime library and natively includes english assets
        const hostArch = await (this.executor!).execute(infoCommand, { env: envWithForceEnglish, dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false).then((result) =>
        {
            const lines = result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
            // This is subject to change but there is no good alternative to do this
            const archLine = lines.find((line) => line.startsWith('Architecture:'));
            if (archLine === undefined)
            {
                this.workerContext.eventStream.post(new DotnetUnableToCheckPATHArchitecture(`Could not find the architecture of the dotnet host ${hostPath}. If this host does not match the architecture ${expectedArchitecture}:
Please set the PATH to a dotnet host that matches the architecture. An incorrect architecture will cause instability for any C# or .NET related applications that rely on this install.`));
                if (process.env.DOTNET_INSTALL_TOOL_DONT_ACCEPT_UNKNOWN_ARCH === '1')
                {
                    return 'unknown'; // Bad value to cause failure mismatch, which will become 'auto'
                }
                else
                {
                    return '';
                }
            }
            const arch = archLine.split(' ')[1];
            return arch;
        });

        return hostArch;
    }

    /**
     *
     * @param existingPath the path to the executable of the dotnet muxer
     * @param requestedArchitecture the architecture we want SDKs of - not a strict requirement, you must validate afterward
     * @returns An array of IDotnetListInfo objects representing the SDKs installed on the system - arch is always null
     */
    private async getSDKs(existingPath: string, requestedArchitecture: string): Promise<IDotnetListInfo[]>
    {
        if (!existingPath || existingPath === '""')
        {
            return [];
        }

        const findSDKsCommand = CommandExecutor.makeCommand(`"${existingPath}"`, ['--list-sdks', '--arch', requestedArchitecture]);

        const result = await (this.executor!).execute(findSDKsCommand, { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false);

        if (result.status !== '0')
        {
            return [];
        }

        const sdks = result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
        const sdkInfos: IDotnetListInfo[] = sdks.map((sdk) =>
        {
            const parts = sdk.split(' ', 2);
            return {
                mode: 'sdk',
                version: parts?.[0],
                directory: sdk.split(' ').slice(1).join(' ').slice(1, -1), // need to remove the brackets from the path [path],
                architecture: null
            } as IDotnetListInfo;
        }).filter(x => x !== null) as IDotnetListInfo[];

        return sdkInfos;
    }

    private async hostSupportsArchFlag(dotnetExecutablePath: string, availableInstalls: IDotnetListInfo[]): Promise<boolean>
    {
        // https://github.com/dotnet/runtime/pull/116078 --arch was not added until .NET 10 to allow us to skip calling dotnet --info because that is slow, as it is not native code.
        // However, --arch gets ignored if the host does not support it. The output is also identical with or without --arch.
        // After discussion with the runtime team, the best way to determine if the host supports --arch is to call it with an invalid arch to see if it fails, because that only happens when --arch is supported.

        // The --arch flag was added in the middle of .NET 10, so we can assume it is supported if the version is 10.0 or later.
        // We don't want to slow down the current common case for people without .NET 10 by adding another process spawn check.
        // We don't check that the version is 10.0 or later after 2026 when .NET 11 starts rolling out, as It will be slower to check all of the numbers in the output for versions >= 10.
        const hostMaySupportArchFlag = availableInstalls.some(install => install.version.startsWith("10.0") || install.version.startsWith("11.0")) || Date.now() >= new Date('2026-03-01').getTime();
        // Use runtimes instead of sdks, as sdks will always have a runtime, and runtime search can be cached across both mode calls.
        const findInvalidCommand = CommandExecutor.makeCommand(`"${dotnetExecutablePath}"`, ['--list-runtimes', '--arch', 'invalid-arch']);
        const hostSupportsArchFlag = hostMaySupportArchFlag ? (await (this.executor!).execute(findInvalidCommand, { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false)).status !== '0' : false;
        return hostSupportsArchFlag;
    }

    private getRuntimesCommand(existingPath: string, requestedArchitecture: string): CommandExecutorCommand
    {
        return CommandExecutor.makeCommand(`"${existingPath}"`, ['--list-runtimes', '--arch', requestedArchitecture]);
    }

    /**
     *
     * @param existingPath the path to the executable of the dotnet muxer
     * @param requestedArchitecture the architecture we want runtimes of - not a strict requirement, you must validate afterward
     * @returns an array of IDotnetListInfo objects representing the runtimes installed on the system - arch is always null
     */
    public async getRuntimes(existingPath: string, requestedArchitecture: string | null): Promise<IDotnetListInfo[]>
    {
        if (!existingPath || existingPath === '""')
        {
            return [];
        }

        requestedArchitecture ??= DotnetCoreAcquisitionWorker.defaultArchitecture()

        const windowsDesktopString = 'Microsoft.WindowsDesktop.App';
        const aspnetCoreString = 'Microsoft.AspNetCore.App';
        const runtimeString = 'Microsoft.NETCore.App';

        const result = await (this.executor!).execute(this.getRuntimesCommand(existingPath, requestedArchitecture), { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false);

        if (result.status !== '0')
        {
            return [];
        }

        const runtimes = result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
        const runtimeInfos: IDotnetListInfo[] = runtimes.map((runtime) =>
        {
            const parts = runtime.split(' ', 3); // account for spaces in PATH, no space should appear before then and luckily path is last
            return {
                mode: parts?.[0] === aspnetCoreString ? 'aspnetcore' : parts[0] === runtimeString ? 'runtime' : 'sdk', // sdk is a placeholder for windows desktop, so it can get filtered out until we supported that.
                version: parts?.[1],
                directory: runtime.split(' ').slice(2).join(' ').slice(1, -1), // account for spaces in PATH, no space should appear before then and luckily path is last.
                // the 2nd slice needs to remove the brackets from the path [path]
                architecture: null
            } as IDotnetListInfo;
        }).filter(x => x !== null) as IDotnetListInfo[];

        return runtimeInfos.filter(x => x.mode !== 'sdk');
    }
}