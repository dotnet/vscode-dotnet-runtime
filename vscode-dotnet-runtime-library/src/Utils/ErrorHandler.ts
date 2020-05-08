/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as open from 'open';
import {
    DotnetCommandFailed,
    DotnetCommandSucceeded,
} from '../EventStream/EventStreamEvents';
import { IIssueContext } from './IIssueContext';
import { formatIssueUrl } from './IssueReporter';

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
    export const moreInfoUrl = 'https://github.com/dotnet/vscode-dotnet-runtime/blob/master/Documentation/troubleshooting.md';
}

export namespace timeoutConstants {
    export const timeoutMessage = '.NET installation timed out.';
    export const moreInfoOption = 'More information';
    export const timeoutInfoUrl = 'https://github.com/dotnet/vscode-dotnet-runtime/blob/master/Documentation/troubleshooting.md#install-script-timeouts';
}

let showMessage = true;

export async function callWithErrorHandling<T>(callback: () => T, context: IIssueContext): Promise<T | undefined> {
    try {
        const result = await callback();
        context.eventStream.post(new DotnetCommandSucceeded(context.commandName));
        return result;
    } catch (error) {
        context.eventStream.post(new DotnetCommandFailed(error, context.commandName));
        if (context.errorConfiguration === AcquireErrorConfiguration.DisplayAllErrorPopups) {
            if ((error.message as string).includes(timeoutConstants.timeoutMessage)) {
                context.displayWorker.showErrorMessage(`${errorConstants.errorMessage}: ${ error.message }`, async (response: string | undefined) => {
                    if (response === timeoutConstants.moreInfoOption) {
                        open(timeoutConstants.timeoutInfoUrl);
                    }
                }, timeoutConstants.moreInfoOption);
            } else if (error.constructor.name !== 'UserCancelledError' && showMessage) {
                context.displayWorker.showErrorMessage(`${errorConstants.errorMessage}: ${ error.message }`, async (response: string | undefined) => {
                    if (response === errorConstants.moreInfoOption) {
                        open(errorConstants.moreInfoUrl);
                    } else if (response === errorConstants.hideOption) {
                        showMessage = false;
                    } else if (response === errorConstants.reportOption) {
                        const [url, issueBody] = formatIssueUrl(error, context);
                        context.displayWorker.copyToUserClipboard(issueBody);
                        open(url);
                    }
                }, errorConstants.reportOption, errorConstants.hideOption, errorConstants.moreInfoOption);
            }
        }
        return undefined;
    } finally {
        context.logger.dispose();
    }
}
