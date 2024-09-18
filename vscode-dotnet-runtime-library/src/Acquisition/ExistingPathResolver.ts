/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IDotnetAcquireContext } from '../IDotnetAcquireContext';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IExistingPaths } from '../IExtensionContext';
import { DotnetInstallMode } from './DotnetInstallMode';
import * as versionUtils from './VersionUtilities';
import { ICommandExecutor } from '../Utils/ICommandExecutor';

const badExistingPathWarningMessage = `The 'existingDotnetPath' setting was set, but it did not meet the requirements for this extension to run properly.
This setting has been ignored.
If you would like to continue to use the setting anyways, set dotnetAcquisitionExtension.allowInvalidPaths to true in the .NET Install Tool Extension Settings.`;

interface IDotnetListInfo { mode: DotnetInstallMode, version: string, directory : string };

export class ExistingPathResolver
{

    public constructor(private readonly workerContext : IAcquisitionWorkerContext, private readonly utilityContext : IUtilityContext, private executor? : ICommandExecutor)
    {
        this.executor ??= new CommandExecutor(this.workerContext, this.utilityContext);
    }

    public async resolveExistingPath(existingPaths: IExistingPaths | undefined, extensionId: string | undefined, windowDisplayWorker: IWindowDisplayWorker): Promise<IDotnetAcquireResult | undefined>
    {
        const existingPath = this.getExistingPath(existingPaths, extensionId, windowDisplayWorker);
        if (existingPath && (await this.providedPathMeetsAPIRequirement(this.workerContext, existingPath, this.workerContext.acquisitionContext) || this.allowInvalidPath(this.workerContext)))
        {
            return { dotnetPath: existingPath } as IDotnetAcquireResult;
        }

        return undefined;
    }

    private getExistingPath(existingPaths: IExistingPaths | undefined, extensionId: string | undefined, windowDisplayWorker: IWindowDisplayWorker) : string | null
    {
        if (existingPaths && ((existingPaths?.individualizedExtensionPaths?.length ?? 0) > 0 || existingPaths?.sharedExistingPath))
        {
            if (!extensionId)
            {
                // Use the global path if it is specified
                if (existingPaths.sharedExistingPath)
                {
                    return existingPaths.sharedExistingPath;
                }
                else
                {
                    windowDisplayWorker.showWarningMessage(
                        'Ignoring existing .NET paths defined in settings.json because requesting extension does not define its extension ID. Please file a bug against the requesting extension.',
                        () => { /* No callback */ },
                    );
                    return null;
                }
            }
            else
            {
                const matchingExtensions = existingPaths.individualizedExtensionPaths?.filter((pair) => pair.extensionId === extensionId);
                if(matchingExtensions && matchingExtensions.length > 0)
                {
                    const existingLocalPath = existingPaths.individualizedExtensionPaths?.filter((pair) => pair.extensionId === extensionId);
                    if (existingLocalPath && existingLocalPath.length > 0) {
                        return existingLocalPath![0].path;
                    }
                }
                else if (existingPaths.sharedExistingPath)
                {
                    return existingPaths.sharedExistingPath;
                }
                else
                {
                    windowDisplayWorker.showWarningMessage(
                        `Ignoring existing .NET paths defined in settings.json because the setting is only set for other extensions, and not for ${extensionId}`,
                        () => { /* No callback */ },
                    );
                    return null;
                }
            }
        }

        return null;
    }

    private allowInvalidPath(workerContext : IAcquisitionWorkerContext) : boolean
    {
        return workerContext.allowInvalidPathSetting ?? false;
    }

    private async providedPathMeetsAPIRequirement(workerContext : IAcquisitionWorkerContext, existingPath : string, apiRequest : IDotnetAcquireContext) : Promise<boolean>
    {

        const availableRuntimes = await this.getRuntimes(existingPath);
        const requestedMajorMinor = versionUtils.getMajorMinor(apiRequest.version, this.workerContext.eventStream, this.workerContext);

        if(availableRuntimes.some((runtime) =>
        {
            return runtime.mode === apiRequest.mode && versionUtils.getMajorMinor(runtime.version, this.workerContext.eventStream, this.workerContext) === requestedMajorMinor;
        }))
        {
            return true;
        }
        else
        {
            const availableSDKs = await this.getSDKs(existingPath);
            if(availableSDKs.some((sdk) =>
            {
                // The SDK includes the Runtime, ASP.NET Core Runtime, and Windows Desktop Runtime. So, we don't need to check the mode.
                return versionUtils.getMajorMinor(sdk.version, this.workerContext.eventStream, this.workerContext) === requestedMajorMinor;
            }))
            {
                return true;
            }

            if(!this.allowInvalidPath(workerContext))
            {
                this.utilityContext.ui.showWarningMessage(`${badExistingPathWarningMessage}\nExtension: ${workerContext.acquisitionContext.requestingExtensionId ?? 'Unspecified'}`, () => {/* No Callback */}, );
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
                    const parts = sdk.split(' ', 2); // account for spaces in PATH, no space should appear before then and luckily path is last
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
