/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IDotnetAcquireContext } from '..';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IExistingPaths } from '../IExtensionContext';

const badExistingPathWarningMessage = `The 'existingDotnetPath' setting was set, but it did not meet the requirements for this extension to run properly.
This setting has been ignored.
If you would like to continue to use the setting anyways, set dotnetAcquisitionExtension.allowInvalidPaths to true in the .NET Install Tool Extension Settings.
If you would like to disable this warning and use the setting only when it works, set dotnetAcquisitionExtension.disableExistingPathWarning to true in the .NET Install Tool Extension Settings.`;

export class ExistingPathResolver
{
    public resolveExistingPath(existingPaths: IExistingPaths | undefined, extensionId: string | undefined, windowDisplayWorker: IWindowDisplayWorker): IDotnetAcquireResult | undefined
    {
        const existingPath = this.getExistingPath(existingPaths, extensionId, windowDisplayWorker);
        // todo get context
        if (existingPath && existingPathMatchesAPIRequestCondition(existingPath, {}) || allowInvalid)
        {
            return { dotnetPath: existingPath };
        }
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
    }

    private existingPathMatchesAPIRequestCondition(existingPath : string, apiRequest : IDotnetAcquireContext) : boolean
    {
        // todo impl
        return true;
    }
    else
    {
        if(warning)
        {
            showWarning
        }
        return false;
    }
}
