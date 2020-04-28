/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as open from 'open';
import { AcquireErrorConfiguration, errorConstants, timeoutConstants } from './ErrorConstants';
import { IIssueContext } from './IIssueContext';
import { formatIssueUrl } from './IssueReporter';

let showMessage = true;

export async function callWithErrorHandling<T>(callback: () => T, context: IIssueContext): Promise<T | undefined> {
    try {
        return await callback();
    } catch (error) {
        if (context.errorConfiguration === AcquireErrorConfiguration.DisplayAllErrorPopups) {
            if ((error.message as string).includes(timeoutConstants.timeoutMessage)) {
                context.displayWorker.showErrorMessage(`${errorConstants.errorMessage}: ${ error.message }`, async (response: string | undefined) => {
                    if (response === timeoutConstants.moreInfoOption) {
                        open(timeoutConstants.timeoutInfoUrl);
                    }
                }, timeoutConstants.moreInfoOption);
            } else if (error.constructor.name !== 'UserCancelledError' && showMessage) {
                context.displayWorker.showErrorMessage(`${errorConstants.errorMessage}: ${ error.message }`, async (response: string | undefined) => {
                    if (response === errorConstants.hideOption) {
                        showMessage = false;
                    } else if (response === errorConstants.reportOption) {
                        const [url, issueBody] = formatIssueUrl(error, context);
                        context.displayWorker.copyToUserClipboard(issueBody);
                        open(url);
                    }
                }, errorConstants.reportOption, errorConstants.hideOption);
            }
        }
        return undefined;
    } finally {
        context.logger.dispose();
    }
}
