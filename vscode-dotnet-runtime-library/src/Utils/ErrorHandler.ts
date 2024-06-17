/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as open from 'open';
import {
    DotnetCommandFailed,
    DotnetCommandSucceeded,
    DotnetGlobalSDKAcquisitionError,
    DotnetInstallExpectedAbort,
    DotnetNotInstallRelatedCommandFailed,
    EventCancellationError
} from '../EventStream/EventStreamEvents';
import { getInstallKeyFromContext } from './InstallKeyUtilities';
import { IIssueContext } from './IIssueContext';
import { formatIssueUrl } from './IssueReporter';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { GetDotnetInstallInfo } from '../Acquisition/DotnetInstall';
import { DotnetCoreAcquisitionWorker } from '../Acquisition/DotnetCoreAcquisitionWorker';
/* tslint:disable:no-any */

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
    catch (caughtError : any)
    {
        const error = caughtError as Error;
        if(!isCancellationStyleError(error))
        {
            context.eventStream.post(isAcquisitionError ?
                new DotnetCommandFailed(error, context.commandName, getInstallKeyFromContext(acquireContext)) :
                // The output observer will keep track of installs and we don't want a non-install failure to make it think it should -=1 from the no. of installs
                new DotnetNotInstallRelatedCommandFailed(error, context.commandName)
            );
        }

        if(acquireContext?.installMode === 'sdk' && acquireContext.acquisitionContext?.installType === 'global')
        {
            context.eventStream.post(new DotnetGlobalSDKAcquisitionError(error, (caughtError?.eventType) ?? 'Unknown',
               GetDotnetInstallInfo(acquireContext.acquisitionContext.version, acquireContext.installMode, 'global', acquireContext.acquisitionContext.architecture ??

                DotnetCoreAcquisitionWorker.defaultArchitecture()
             )));
        }

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
            else if (!isCancellationStyleError(error) && showMessage)
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
            await context.extensionConfigWorker.setSharedPathConfigurationValue(manualPath);
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

function isCancellationStyleError(error : Error)
{
    // Handle both when the event.error or event itself is posted.
    return error && error.constructor && (error.constructor.name === 'UserCancelledError' || error.constructor.name === 'EventCancellationError') ||
        error instanceof DotnetInstallExpectedAbort || error instanceof EventCancellationError;
}