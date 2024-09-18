/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { DotnetVersionSpecRequirement } from '../DotnetVersionSpecRequirement';
import { IDotnetFindPathContext } from '../IDotnetFindPathContext';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { DotnetInstallMode } from './DotnetInstallMode';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetConditionValidator } from './IDotnetConditionValidator';
import * as versionUtils from './VersionUtilities';

interface IDotnetListInfo { mode: DotnetInstallMode, version: string, directory : string };


export class DotnetConditionValidator implements IDotnetConditionValidator
{
    public constructor(private readonly workerContext : IAcquisitionWorkerContext, private readonly utilityContext : IUtilityContext, private executor? : ICommandExecutor)
    {
        this.executor ??= new CommandExecutor(this.workerContext, this.utilityContext);
    }

    public async versionMeetsRequirement(dotnetExecutablePath: string, requirement : IDotnetFindPathContext) : Promise<boolean>
    {
        const availableRuntimes = await this.getRuntimes(dotnetExecutablePath);
        const requestedMajorMinor = versionUtils.getMajorMinor(requirement.acquireContext.version, this.workerContext.eventStream, this.workerContext);

        if(availableRuntimes.some((runtime) =>
            {
                const foundVersion = versionUtils.getMajorMinor(runtime.version, this.workerContext.eventStream, this.workerContext);
                return runtime.mode === requirement.acquireContext.mode && this.stringVersionMeetsRequirement(foundVersion, requestedMajorMinor, requirement.versionSpecRequirement);
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
                    return this.stringVersionMeetsRequirement(foundVersion, requestedMajorMinor, requirement.versionSpecRequirement);
                }))
            {
                return true;
            }

            return false;
        }
    }

    private async getSDKs(existingPath : string) : Promise<IDotnetListInfo[]>
    {
        const findSDKsCommand = CommandExecutor.makeCommand(existingPath, ['--list-sdks']);

        const sdkInfo = await (this.executor!).execute(findSDKsCommand).then((result) =>
        {
            const runtimes = result.stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
            const runtimeInfos : IDotnetListInfo[] = runtimes.map((sdk) =>
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

            return runtimeInfos;
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

    private async getRuntimes(existingPath : string) : Promise<IDotnetListInfo[]>
    {
        const findRuntimesCommand = CommandExecutor.makeCommand(existingPath, ['--list-runtimes']);

        const windowsDesktopString = 'Microsoft.WindowsDesktop.App';
        const aspnetCoreString = 'Microsoft.AspNetCore.App';
        const runtimeString = 'Microsoft.NETCore.App';

        const runtimeInfo = await (this.executor!).execute(findRuntimesCommand).then((result) =>
        {
            const runtimes = result.stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
            const runtimeInfos : IDotnetListInfo[] = runtimes.map((runtime) =>
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