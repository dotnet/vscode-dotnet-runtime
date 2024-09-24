/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { DotnetVersionSpecRequirement } from '../DotnetVersionSpecRequirement';
import { IDotnetFindPathContext } from '../IDotnetFindPathContext';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { IDotnetListInfo } from './IDotnetListInfo';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetConditionValidator } from './IDotnetConditionValidator';
import * as versionUtils from './VersionUtilities';
import { FileUtilities } from '../Utils/FileUtilities';


export class DotnetConditionValidator implements IDotnetConditionValidator
{
    public constructor(private readonly workerContext : IAcquisitionWorkerContext, private readonly utilityContext : IUtilityContext, private executor? : ICommandExecutor)
    {
        this.executor ??= new CommandExecutor(this.workerContext, this.utilityContext);
    }

    public async dotnetMeetsRequirement(dotnetExecutablePath: string, requirement : IDotnetFindPathContext) : Promise<boolean>
    {
        const availableRuntimes = await this.getRuntimes(dotnetExecutablePath);
        const requestedMajorMinor = versionUtils.getMajorMinor(requirement.acquireContext.version, this.workerContext.eventStream, this.workerContext);
        const hostArch = await this.getHostArchitecture(dotnetExecutablePath);

        if(availableRuntimes.some((runtime) =>
            {
                const foundVersion = versionUtils.getMajorMinor(runtime.version, this.workerContext.eventStream, this.workerContext);
                return runtime.mode === requirement.acquireContext.mode && this.stringArchitectureMeetsRequirement(hostArch, requirement.acquireContext.architecture!) &&
                    this.stringVersionMeetsRequirement(foundVersion, requestedMajorMinor, requirement.versionSpecRequirement);
            }))
        {
            return true;
        }
        else
        {
            const availableSDKs = await this.getSDKs(dotnetExecutablePath);
            if(availableSDKs.some((sdk) =>
                {
                    // The SDK includes the Runtime, ASP.NET Core Runtime, and Windows Desktop Runtime. So, we don't need to check the mode.
                    const foundVersion = versionUtils.getMajorMinor(sdk.version, this.workerContext.eventStream, this.workerContext);
                    return this.stringArchitectureMeetsRequirement(hostArch, requirement.acquireContext.architecture!), this.stringVersionMeetsRequirement(foundVersion, requestedMajorMinor, requirement.versionSpecRequirement);
                }))
            {
                return true;
            }

            return false;
        }
    }

    /**
     *
     * @param hostPath The path to the dotnet executable
     * @returns The architecture of the dotnet host from the PATH.
     * The .NET Host will only list versions of the runtime and sdk that match its architecture.
     * Thus, any runtime or sdk that it prints out will be the same architecture as the host.
     *
     * @remarks Will return '' if the architecture cannot be determined for some peculiar reason (e.g. dotnet --info is broken or changed). )
     */
    private async getHostArchitecture(hostPath : string) : Promise<string>
    {
        const infoCommand = CommandExecutor.makeCommand(`"${hostPath}"`, ['--info']);
        const envWithForceEnglish = process.env;
        envWithForceEnglish.DOTNET_CLI_UI_LANGUAGE = 'en-US';

        // System may not have english installed, but CDK already calls this without issue -- the .NET SDK language invocation is also wrapped by a runtime library and natively includes english assets
        const hostArch = await (this.executor!).execute(infoCommand, { env: envWithForceEnglish }, false).then((result) =>
        {
            const lines = result.stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
            // This is subject to change but there is no good alternative to do this
            const archLine = lines.find((line) => line.startsWith('Architecture:'));
            if(archLine === undefined)
            {
                return '';
            }
            const arch = archLine.split(' ')[1];
            return arch;
        });

        return hostArch;
    }

    public async getSDKs(existingPath : string) : Promise<IDotnetListInfo[]>
    {
        const findSDKsCommand = CommandExecutor.makeCommand(`"${existingPath}"`, ['--list-sdks']);

        const sdkInfo = await (this.executor!).execute(findSDKsCommand, undefined, false).then((result) =>
        {
            const sdks = result.stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
            const sdkInfos : IDotnetListInfo[] = sdks.map((sdk) =>
            {
                if(sdk === '') // new line in output that got trimmed
                {
                    return null;
                }
                const parts = sdk.split(' ', 2);
                return {
                    mode: 'sdk',
                    version: parts[0],
                    directory: sdk.split(' ').slice(1).join(' ').slice(1, -1) // need to remove the brackets from the path [path]
                } as IDotnetListInfo;
            }).filter(x => x !== null) as IDotnetListInfo[];

            return sdkInfos;
        });

        return sdkInfo;
    }

    private stringVersionMeetsRequirement(foundVersion : string, requiredVersion : string, requirement : DotnetVersionSpecRequirement) : boolean
    {
        if(requirement === 'equal')
            {
                return foundVersion == requiredVersion;
            }
            else if(requirement === 'greater_than_or_equal')
            {
                return foundVersion >= requiredVersion;
            }
            else if(requirement === 'less_than_or_equal')
            {
                return foundVersion <= requiredVersion;
            }
            else
            {
                return false;
            }
    }

    private stringArchitectureMeetsRequirement(outputArchitecture : string, requiredArchitecture : string) : boolean
    {
        return FileUtilities.dotnetInfoArchToNodeArch(outputArchitecture, this.workerContext.eventStream) === requiredArchitecture;
    }

    public async getRuntimes(existingPath : string) : Promise<IDotnetListInfo[]>
    {
        const findRuntimesCommand = CommandExecutor.makeCommand(`"${existingPath}"`, ['--list-sdks']);

        const windowsDesktopString = 'Microsoft.WindowsDesktop.App';
        const aspnetCoreString = 'Microsoft.AspNetCore.App';
        const runtimeString = 'Microsoft.NETCore.App';

        const runtimeInfo = await (this.executor!).execute(findRuntimesCommand, undefined, false).then((result) =>
        {
            const sdks = result.stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
            const runtimeInfos : IDotnetListInfo[] = sdks.map((runtime) =>
            {
                if(runtime === '') // new line in output that got trimmed
                {
                    return null;
                }
                const parts = runtime.split(' ', 3); // account for spaces in PATH, no space should appear before then and luckily path is last
                return {
                    mode: parts[0] === aspnetCoreString ? 'aspnetcore' : parts[0] === runtimeString ? 'runtime' : 'sdk', // sdk is a placeholder for windows desktop, will never match since this is for runtime search only
                    version: parts[1],
                    directory: runtime.split(' ').slice(2).join(' ').slice(1, -1) // account for spaces in PATH, no space should appear before then and luckily path is last.
                    // the 2nd slice needs to remove the brackets from the path [path]
                } as IDotnetListInfo;
            }).filter(x => x !== null) as IDotnetListInfo[];

            return runtimeInfos;
        });

        return runtimeInfo;
    }
}