/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as open from 'open';
import { env, window } from 'vscode';
import { ErrorConfiguration, errorConstants, timeoutConstants } from './Constants';
import { IIssueContext } from './IIssueContext';
import { formatIssueUrl } from './IssueReporter';

let showMessage = true;

export async function callWithErrorHandling<T>(callback: () => T, context: IIssueContext): Promise<T | undefined> {
    try {
        return await callback();
    } catch (error) {
        if (context.errorConfiguration === ErrorConfiguration.DisplayAllErrorPopups) {
            if ((error.message as string).includes(timeoutConstants.timeoutMessage)) {
                window.showErrorMessage(`${errorConstants.errorMessage}: ${ error.message }`, timeoutConstants.moreInfoOption).then(async (response: string | undefined) => {
                    if (response === timeoutConstants.moreInfoOption) {
                        open(timeoutConstants.timeoutInfoUrl);
                    }
                });
            } else if (error.constructor.name !== 'UserCancelledError' && showMessage) {
                window.showErrorMessage(`${errorConstants.errorMessage}: ${ error.message }`, errorConstants.reportOption, errorConstants.hideOption).then(async (response: string | undefined) => {
                    if (response === errorConstants.hideOption) {
                        showMessage = false;
                    } else if (response === errorConstants.reportOption) {
                        const [url, issueBody] = formatIssueUrl(error, context);
                        await env.clipboard.writeText(issueBody);
                        open(url);
                    }
                });
            }
        }
        return undefined;
    } finally {
        context.logger.dispose();
    }
}
