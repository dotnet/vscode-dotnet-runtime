/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IDotnetFindPathContext } from '../IDotnetFindPathContext';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { IDotnetListInfo } from './IDotnetListInfo';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetConditionValidator } from './IDotnetConditionValidator';
import * as versionUtils from './VersionUtilities';
import * as os from 'os';
import { FileUtilities } from '../Utils/FileUtilities';
import { DotnetFindPathDidNotMeetCondition, DotnetUnableToCheckPATHArchitecture } from '../EventStream/EventStreamEvents';


export class DotnetConditionValidator implements IDotnetConditionValidator
{
    public constructor(private readonly workerContext : IAcquisitionWorkerContext, private readonly utilityContext : IUtilityContext, private executor? : ICommandExecutor)
    {
        this.executor ??= new CommandExecutor(this.workerContext, this.utilityContext);
    }

    public async dotnetMeetsRequirement(dotnetExecutablePath: string, requirement : IDotnetFindPathContext) : Promise<boolean>
    {
        const availableRuntimes = await this.getRuntimes(dotnetExecutablePath);
        const hostArch = await this.getHostArchitecture(dotnetExecutablePath, requirement);

        if(availableRuntimes.some((runtime) =>
            {
                return runtime.mode === requirement.acquireContext.mode && this.stringArchitectureMeetsRequirement(hostArch, requirement.acquireContext.architecture) &&
                    this.stringVersionMeetsRequirement(runtime.version, requirement.acquireContext.version, requirement) && allowPreview(runtime.version, requirement);
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
                    return this.stringArchitectureMeetsRequirement(hostArch, requirement.acquireContext.architecture) &&
                        this.stringVersionMeetsRequirement(sdk.version, requirement.acquireContext.version, requirement) && allowPreview(sdk.version, requirement);
                }))
            {
                return true;
            }
            else
            {
                this.workerContext.eventStream.post(new DotnetFindPathDidNotMeetCondition(`${dotnetExecutablePath} did NOT satisfy the conditions: hostArch: ${hostArch}, requiredArch: ${requirement.acquireContext.architecture},
                    required version: ${requirement.acquireContext.version}, required mode: ${requirement.acquireContext.mode}`));
            }
        }

        return false;
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
    private async getHostArchitecture(hostPath : string, requirement : IDotnetFindPathContext) : Promise<string>
    {
        // dotnet --info is not machine-readable and subject to breaking changes. See https://github.com/dotnet/sdk/issues/33697 and https://github.com/dotnet/runtime/issues/98735/
        // Unfortunately even with a new API, that might not go in until .NET 10 and beyond, so we have to rely on dotnet --info for now.*/

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
                this.workerContext.eventStream.post(new DotnetUnableToCheckPATHArchitecture(`Could not find the architecture of the dotnet host ${hostPath}. If this host does not match the architecture ${requirement.acquireContext.architecture}:
Please set the PATH to a dotnet host that matches the architecture ${requirement.acquireContext.architecture}. An incorrect architecture will cause instability for the extension ${requirement.acquireContext.requestingExtensionId}.`));
                if(process.env.DOTNET_INSTALL_TOOL_DONT_ACCEPT_UNKNOWN_ARCH === '1')
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

    public async getSDKs(existingPath : string) : Promise<IDotnetListInfo[]>
    {
        const findSDKsCommand = await this.setCodePage() ? CommandExecutor.makeCommand(`chcp`, [`65001`, `|`,`"${existingPath}"`, '--list-sdks']) :
            CommandExecutor.makeCommand(`"${existingPath}"`, ['--list-sdks']);

        const sdkInfo = await (this.executor!).execute(findSDKsCommand, undefined, false).then((result) =>
        {
            const sdks = result.stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
            const sdkInfos : IDotnetListInfo[] = sdks.map((sdk) =>
            {
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

    private async setCodePage() : Promise<boolean>
    {
        // For Windows, we need to change the code page to UTF-8 to handle the output of the command. https://github.com/nodejs/node-v0.x-archive/issues/2190
        // Only certain builds of windows support UTF 8 so we need to check that we can use it.
        return os.platform() === 'win32' ? (await this.executor!.tryFindWorkingCommand([CommandExecutor.makeCommand('chcp', ['65001'])])) !== null : false;
    }

    private stringVersionMeetsRequirement(availableVersion : string, requestedVersion : string, requirement : IDotnetFindPathContext) : boolean
    {
        const availableMajor = Number(versionUtils.getMajor(availableVersion, this.workerContext.eventStream, this.workerContext));
        const requestedMajor = Number(versionUtils.getMajor(requestedVersion, this.workerContext.eventStream, this.workerContext));
        const requestedPatchStr : string | null = requirement.acquireContext.mode !== 'sdk' ? versionUtils.getRuntimePatchVersionString(requestedVersion, this.workerContext.eventStream, this.workerContext)
            : versionUtils.getSDKCompleteBandAndPatchVersionString(requestedVersion, this.workerContext.eventStream, this.workerContext);
        const requestedPatch = requestedPatchStr ? Number(requestedPatchStr) : null;

        if(availableMajor === requestedMajor)
        {
            const availableMinor = Number(versionUtils.getMinor(availableVersion, this.workerContext.eventStream, this.workerContext));
            const requestedMinor = Number(versionUtils.getMinor(requestedVersion, this.workerContext.eventStream, this.workerContext));

            if(availableMinor === requestedMinor && requestedPatch)
            {
                const availablePatchStr : string | null = requirement.acquireContext.mode !== 'sdk' ? versionUtils.getRuntimePatchVersionString(availableVersion, this.workerContext.eventStream, this.workerContext)
                    : versionUtils.getSDKCompleteBandAndPatchVersionString(availableVersion, this.workerContext.eventStream, this.workerContext);
                const availablePatch = availablePatchStr ? Number(availablePatchStr) : null;
                switch(requirement.versionSpecRequirement)
                {
                    case 'equal':
                        return availablePatch === requestedPatch;
                    case 'greater_than_or_equal':
                        // the 'availablePatch' must exist, since the version is from --list-runtimes or --list-sdks.
                        return availablePatch! >= requestedPatch;
                    case 'less_than_or_equal':
                        return availablePatch! <= requestedPatch;
                }
            }
            else
            {
                switch(requirement.versionSpecRequirement)
                {
                    case 'equal':
                        return availableMinor === requestedMinor;
                    case 'greater_than_or_equal':
                        return availableMinor >= requestedMinor;
                    case 'less_than_or_equal':
                        return availableMinor <= requestedMinor;
                }
            }
        }
        else
        {
            switch(requirement.versionSpecRequirement)
            {
                case 'equal':
                    return false;
                case 'greater_than_or_equal':
                    return availableMajor >= requestedMajor;
                case 'less_than_or_equal':
                    return availableMajor <= requestedMajor;
            }
        }
    }

    private stringArchitectureMeetsRequirement(outputArchitecture : string, requiredArchitecture : string | null | undefined) : boolean
    {
        return !requiredArchitecture || outputArchitecture === '' || FileUtilities.dotnetInfoArchToNodeArch(outputArchitecture, this.workerContext.eventStream) === requiredArchitecture;
    }

    private allowPreview(availableVersion : string, requirement : IDotnetFindPathContext) : boolean
    {
        if(requirement.rejectPreviews === true)
        {
            return !versionUtils.isPreviewVersion(availableVersion);
        }
        return true;
    }

    public async getRuntimes(existingPath : string) : Promise<IDotnetListInfo[]>
    {
        const findRuntimesCommand = await this.setCodePage() ? CommandExecutor.makeCommand(`chcp`, [`65001`, `|`,`"${existingPath}"`, '--list-runtimes']) :
            CommandExecutor.makeCommand(`"${existingPath}"`, ['--list-runtimes']);

        const windowsDesktopString = 'Microsoft.WindowsDesktop.App';
        const aspnetCoreString = 'Microsoft.AspNetCore.App';
        const runtimeString = 'Microsoft.NETCore.App';

        const runtimeInfo = await (this.executor!).execute(findRuntimesCommand, undefined, false).then((result) =>
        {
            const runtimes = result.stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
            const runtimeInfos : IDotnetListInfo[] = runtimes.map((runtime) =>
            {
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