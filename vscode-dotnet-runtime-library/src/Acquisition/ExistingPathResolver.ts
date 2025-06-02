/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { DotnetVersionSpecRequirement } from '../DotnetVersionSpecRequirement';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IDotnetFindPathContext } from '../IDotnetFindPathContext';
import { IExistingPaths } from '../IExtensionContext';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { DotnetConditionValidator } from './DotnetConditionValidator';
import { DotnetPathFinder } from './DotnetPathFinder';

const badExistingPathWarningMessage = `The 'existingDotnetPath' setting was set, but it did not meet the requirements for this extension to run properly.
This setting has been ignored.
If you would like to continue to use the setting anyways, set dotnetAcquisitionExtension.allowInvalidPaths to true in the .NET Install Tool Extension Settings.`;


export class ExistingPathResolver
{
    private lastSeenNonTruePathValue: string | null = null;

    public constructor(private readonly workerContext: IAcquisitionWorkerContext, private readonly utilityContext: IUtilityContext, private executor?: ICommandExecutor)
    {
        this.executor ??= new CommandExecutor(this.workerContext, this.utilityContext);
    }

    public async resolveExistingPath(existingPaths: IExistingPaths | undefined, extensionId: string | undefined, windowDisplayWorker: IWindowDisplayWorker, requirement?: DotnetVersionSpecRequirement): Promise<IDotnetAcquireResult | undefined>
    {
        let existingPath = this.getExistingPath(existingPaths, extensionId, windowDisplayWorker);
        this.lastSeenNonTruePathValue = existingPath;
        if (!this.allowInvalidPath(this.workerContext))
        {
            if (!existingPath || existingPath === '""')
            {
                return undefined;
            }

            // The user path setting may be a symlink but we dont want to resolve it since a snap symlink isnt a real directory, we can find the true path better this way:
            const oldLookup = process.env.DOTNET_MULTILEVEL_LOOKUP;
            process.env.DOTNET_MULTILEVEL_LOOKUP = '0'; // make it so --list-runtimes only finds the runtimes on that path: https://learn.microsoft.com/en-us/dotnet/core/compatibility/deployment/7.0/multilevel-lookup#reason-for-change

            const dotnetFinder = new DotnetPathFinder(this.workerContext, this.utilityContext, this.executor);
            const resolvedPaths = await dotnetFinder.returnWithRestoringEnvironment(await dotnetFinder.getTruePath([existingPath ?? ''], this.workerContext.acquisitionContext?.architecture ?? null), 'DOTNET_MULTILEVEL_LOOKUP', oldLookup);
            existingPath = resolvedPaths?.[0] ?? null;
        }
        if (existingPath && (await this.providedPathMeetsAPIRequirement(this.workerContext, existingPath, this.workerContext.acquisitionContext, requirement) || this.allowInvalidPath(this.workerContext)))
        {
            return { dotnetPath: existingPath } as IDotnetAcquireResult;
        }

        return undefined;
    }

    /**
     * @remarks Returns the last path this class processed before getting the true path.
     * This is a bit of a hack to allow tests to evaluate the class more thoroughly.
     */
    public getlastSeenNonTruePathValue(): string | null
    {
        return this.lastSeenNonTruePathValue;
    }

    private getExistingPath(existingPaths: IExistingPaths | undefined, extensionId: string | undefined, windowDisplayWorker: IWindowDisplayWorker): string | null
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
                if (matchingExtensions && matchingExtensions.length > 0)
                {
                    const existingLocalPath = existingPaths.individualizedExtensionPaths?.filter((pair) => pair.extensionId === extensionId);
                    if (existingLocalPath && existingLocalPath.length > 0)
                    {
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

    private allowInvalidPath(workerContext: IAcquisitionWorkerContext): boolean
    {
        return workerContext.allowInvalidPathSetting ?? false;
    }

    private async providedPathMeetsAPIRequirement(workerContext: IAcquisitionWorkerContext, existingPath: string, apiRequest: IDotnetAcquireContext, requirement?: DotnetVersionSpecRequirement): Promise<boolean>
    {
        const validator = new DotnetConditionValidator(this.workerContext, this.utilityContext, this.executor);
        const validated = await validator.dotnetMeetsRequirement(existingPath, { acquireContext: apiRequest, versionSpecRequirement: requirement ?? 'equal' } as IDotnetFindPathContext);

        if (!validated && !this.allowInvalidPath(workerContext))
        {
            this.utilityContext.ui.showWarningMessage(`${badExistingPathWarningMessage}\nExtension: ${workerContext.acquisitionContext.requestingExtensionId ?? 'Unspecified'}`, () => {/* No Callback */ },);
        }

        return validated;
    }
}
