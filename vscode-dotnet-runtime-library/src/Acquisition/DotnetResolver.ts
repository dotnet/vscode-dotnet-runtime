
/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { DotnetUnableToCheckPATHArchitecture } from '../EventStream/EventStreamEvents';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { CommandExecutorCommand } from '../Utils/CommandExecutorCommand';
import { ExecutableArchitectureDetector } from '../Utils/ExecutableArchitectureDetector';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
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

    public async getDotnetInstalls(dotnetExecutablePath: string, mode: DotnetInstallMode, requestedArchitecture: string | undefined | null): Promise<IDotnetListInfo[]>
    {
        const hostArch = new ExecutableArchitectureDetector().getExecutableArchitecture(dotnetExecutablePath);
        const oldLookup = process.env.DOTNET_MULTILEVEL_LOOKUP;
        // This is deprecated but still needed to scan .NET 6 and below
        process.env.DOTNET_MULTILEVEL_LOOKUP = '0'; // make it so --list-runtimes only finds the runtimes on that path: https://learn.microsoft.com/en-us/dotnet/core/compatibility/deployment/7.0/multilevel-lookup#reason-for-change

        try
        {
            if (mode === 'sdk')
            {
                const availableSDKs = await this.getSDKs(dotnetExecutablePath, requestedArchitecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture(), ExecutableArchitectureDetector.IsKnownArchitecture(hostArch));
                const resolvedHostArchitecture = ExecutableArchitectureDetector.IsKnownArchitecture(hostArch) ? hostArch : availableSDKs?.at(0)?.architecture ?? await this.getHostArchitectureViaInfo(dotnetExecutablePath, requestedArchitecture);

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
                const availableRuntimes = await this.getRuntimes(dotnetExecutablePath, requestedArchitecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture(), ExecutableArchitectureDetector.IsKnownArchitecture(hostArch));
                const resolvedHostArchitecture = ExecutableArchitectureDetector.IsKnownArchitecture(hostArch) ? hostArch : availableRuntimes?.at(0)?.architecture ?? await this.getHostArchitectureViaInfo(dotnetExecutablePath, requestedArchitecture);

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
    private async getHostArchitectureViaInfo(hostPath: string, expectedArchitecture?: string | undefined | null): Promise<string>
    {
        // dotnet --info is not machine-readable and subject to breaking changes. See https://github.com/dotnet/sdk/issues/33697 and https://github.com/dotnet/runtime/issues/98735/
        // Unfortunately even with a new API, that might not go in until .NET 10 and beyond, so we have to rely on dotnet --info for now.*/

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
            const lines = result.stdout.split('\n').map((line) => line.trim()).filter((line) => (line?.length ?? 0) > 0);
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

    public async getSDKs(existingPath: string, requestedArchitecture: string, knownArchitecture: boolean): Promise<IDotnetListInfo[]>
    {
        if (!existingPath || existingPath === '""')
        {
            return [];
        }

        const findSDKsCommand = CommandExecutor.makeCommand(`"${existingPath}"`, ['--list-sdks', '--arch', requestedArchitecture]);

        const sdkInfo = await (this.executor!).execute(findSDKsCommand, { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false).then(async (result) =>
        {
            if (result.status !== '0')
            {
                return [];
            }

            const architectureKnown = knownArchitecture ? true : await this.hostSupportsArchFlag(existingPath, result.stdout);
            const sdks = result.stdout.split('\n').map((line) => line.trim()).filter((line) => (line?.length ?? 0) > 0);
            const sdkInfos: IDotnetListInfo[] = sdks.map((sdk) =>
            {
                const parts = sdk.split(' ', 2);
                return {
                    mode: 'sdk',
                    version: parts[0],
                    directory: sdk.split(' ').slice(1).join(' ').slice(1, -1), // need to remove the brackets from the path [path],
                    architecture: architectureKnown ? requestedArchitecture : null
                } as IDotnetListInfo;
            }).filter(x => x !== null) as IDotnetListInfo[];

            return sdkInfos;
        });

        return sdkInfo;
    }

    private async hostSupportsArchFlag(dotnetExecutablePath: string, listDotnetInstallsStdout: string): Promise<boolean>
    {
        // https://github.com/dotnet/runtime/pull/116078 --arch was not added until .NET 10 to allow us to skip calling dotnet --info because that is slow, as it is not native code.
        // However, --arch gets ignored if the host does not support it. The output is also identical with or without --arch.
        // After discussion with the runtime team, the best way to determine if the host supports --arch is to call it with an invalid arch to see if it fails, because that only happens when --arch is supported.

        // The --arch flag was added in the middle of .NET 10, so we can assume it is supported if the version is 10.0 or later.
        // We don't want to slow down the current common case for people without .NET 10 by adding another process spawn check.
        // We don't check that the version is 10.0 or later after 2026 when .NET 11 starts rolling out, as It will be slower to check all of the numbers in the output for versions >= 10.
        const hostMaySupportArchFlag = listDotnetInstallsStdout.includes("10.0") || listDotnetInstallsStdout.includes("11.0") || Date.now() >= new Date('2026-03-01').getTime();
        // Use runtimes instead of sdks, as sdks will always have a runtime, and runtime search can be cached across both mode calls.
        const findInvalidCommand = CommandExecutor.makeCommand(`"${dotnetExecutablePath}"`, ['--list-runtimes', '--arch', 'invalid-arch']);
        const hostSupportsArchFlag = hostMaySupportArchFlag ? (await (this.executor!).execute(findInvalidCommand, { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false)).status !== '0' : false;
        return hostSupportsArchFlag;
    }

    private getRuntimesCommand(existingPath: string, requestedArchitecture: string): CommandExecutorCommand
    {
        return CommandExecutor.makeCommand(`"${existingPath}"`, ['--list-runtimes', '--arch', requestedArchitecture]);
    }

    public async getRuntimes(existingPath: string, requestedArchitecture: string | null, knownArchitecture: boolean): Promise<IDotnetListInfo[]>
    {
        if (!existingPath || existingPath === '""')
        {
            return [];
        }

        requestedArchitecture ??= DotnetCoreAcquisitionWorker.defaultArchitecture()

        const windowsDesktopString = 'Microsoft.WindowsDesktop.App';
        const aspnetCoreString = 'Microsoft.AspNetCore.App';
        const runtimeString = 'Microsoft.NETCore.App';

        const runtimeInfo = await (this.executor!).execute(this.getRuntimesCommand(existingPath, requestedArchitecture), { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false).then(async (result) =>
        {
            if (result.status !== '0')
            {
                return [];
            }

            const architectureKnown = knownArchitecture ? true : await this.hostSupportsArchFlag(existingPath, result.stdout);
            const runtimes = result.stdout.split('\n').map((line) => line.trim()).filter((line) => (line?.length ?? 0) > 0);
            const runtimeInfos: IDotnetListInfo[] = runtimes.map((runtime) =>
            {
                const parts = runtime.split(' ', 3); // account for spaces in PATH, no space should appear before then and luckily path is last
                return {
                    mode: parts[0] === aspnetCoreString ? 'aspnetcore' : parts[0] === runtimeString ? 'runtime' : 'sdk', // sdk is a placeholder for windows desktop, will never match since this is for runtime search only
                    version: parts[1],
                    directory: runtime.split(' ').slice(2).join(' ').slice(1, -1), // account for spaces in PATH, no space should appear before then and luckily path is last.
                    // the 2nd slice needs to remove the brackets from the path [path]
                    architecture: architectureKnown ? requestedArchitecture : null
                } as IDotnetListInfo;
            }).filter(x => x !== null) as IDotnetListInfo[];

            return runtimeInfos;
        });

        return runtimeInfo;
    }
}