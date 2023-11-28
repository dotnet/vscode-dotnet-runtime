/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as open from 'open';
import {
    DotnetCommandFailed,
    DotnetCommandSucceeded,
    DotnetNotInstallRelatedCommandFailed
} from '../EventStream/EventStreamEvents';
import { getInstallKeyFromContext } from '../Utils/InstallKeyGenerator';

import { ExistingPathKeys, IExistingPath } from '../IExtensionContext';
import { IIssueContext } from './IIssueContext';
import { formatIssueUrl } from './IssueReporter';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';


export enum AcquireErrorConfiguration {
    DisplayAllErrorPopups = 0,
    DisableErrorPopups = 1,
}

export enum UninstallErrorConfiguration {
    DisplayAllErrorPopups = 0,
    DisableErrorPopups = 1,
}

export enum EnsureDependenciesErrorConfiguration {
    DisplayAllErrorPopups = 0,
    DisableErrorPopups = 1,
}

export type ErrorConfiguration = AcquireErrorConfiguration | UninstallErrorConfiguration | EnsureDependenciesErrorConfiguration;

export namespace errorConstants {
    export const errorMessage = 'An error occurred while installing .NET';
    export const reportOption = 'Report an issue';
    export const hideOption = 'Don\'t show again';
    export const moreInfoOption = 'More information';
    export const configureManuallyOption = 'Configure manually';
}

export namespace timeoutConstants {
    export const timeoutMessage = `.NET install timed out.
You should change the timeout if you have a slow connection. See: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#install-script-timeouts.
Our CDN may be blocked in China or experience significant slowdown, in which case you should install .NET manually.`;
    export const moreInfoOption = 'Change Timeout Value';
}

let showMessage = true;

export async function callWithErrorHandling<T>(callback: () => T, context: IIssueContext, requestingExtensionId?: string, acquireContext? : IAcquisitionWorkerContext): Promise<T | undefined> {
    const isAcquisitionError = acquireContext ? true : false;
    try
    {
        const result = await callback();
        context.eventStream.post(new DotnetCommandSucceeded(context.commandName));
        return result;
    }
    catch (caughtError)
    {
        const error = caughtError as Error;
        context.eventStream.post(isAcquisitionError ?
            new DotnetCommandFailed(error, context.commandName, getInstallKeyFromContext(acquireContext?.acquisitionContext!)) :
            new DotnetNotInstallRelatedCommandFailed(error, context.commandName)
        );

        if (context.errorConfiguration === AcquireErrorConfiguration.DisplayAllErrorPopups)
        {
            if ((error.message as string).includes(timeoutConstants.timeoutMessage))
            {
                context.displayWorker.showErrorMessage(`${errorConstants.errorMessage}${ context.version ? ` (${context.version})` : '' }: ${ error.message }`,
                                                        async (response: string | undefined) => {
                    if (response === timeoutConstants.moreInfoOption)
                    {
                        open(context.timeoutInfoUrl);
                    }
                }, timeoutConstants.moreInfoOption);
            }
            else if (error.constructor.name !== 'UserCancelledError' && showMessage)
            {
                let errorOptions = [errorConstants.reportOption, errorConstants.hideOption, errorConstants.moreInfoOption];
                if (requestingExtensionId)
                {
                    errorOptions = errorOptions.concat(errorConstants.configureManuallyOption);
                }

                context.displayWorker.showErrorMessage(`${errorConstants.errorMessage}${ context.version ? ` (${context.version})` : '' }: ${ error.message }`,
                    async (response: string | undefined) =>
                    {
                    if (response === errorConstants.moreInfoOption)
                    {
                        open(context.moreInfoUrl);
                    }
                    else if (response === errorConstants.hideOption)
                    {
                        showMessage = false;
                    }
                    else if (response === errorConstants.reportOption)
                    {
                        const [url, issueBody] = formatIssueUrl(error, context);
                        context.displayWorker.copyToUserClipboard(issueBody);
                        open(url);
                    }
                    else if (response === errorConstants.configureManuallyOption && requestingExtensionId)
                    {
                        await configureManualInstall(context, requestingExtensionId);
                    }
                }, ...errorOptions);
            }
        }
        return undefined;
    }
    finally
    {
        context.logger.dispose();
    }
}

async function configureManualInstall(context: IIssueContext, requestingExtensionId: string): Promise<void> {
    const manualPath = await context.displayWorker.displayPathConfigPopUp();
    if (manualPath && fs.existsSync(manualPath))
    {
        try
        {
            let configVal: IExistingPath[] = [{ [ExistingPathKeys.extensionIdKey]: requestingExtensionId, [ExistingPathKeys.pathKey] : manualPath}];
            const existingConfigVal = context.extensionConfigWorker.getPathConfigurationValue();
            if (existingConfigVal)
            {
                configVal = configVal.concat(existingConfigVal);
            }
            await context.extensionConfigWorker.setPathConfigurationValue(configVal);
            context.displayWorker.showInformationMessage(`Set .NET path to ${manualPath}. Please reload VSCode to apply settings.`, () => { /* No callback needed */});
        }
        catch (e)
        {
            context.displayWorker.showWarningMessage(`Failed to configure the path: ${(e as Error).toString()}`, () => { /* No callback needed */ });
        }
    }
    else
    {
        context.displayWorker.showWarningMessage('Manually configured path was not valid.', () => { /* No callback needed */ });
    }
}
