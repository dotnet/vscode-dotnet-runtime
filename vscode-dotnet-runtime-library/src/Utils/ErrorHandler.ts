/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as open from 'open';
import { env, window } from 'vscode';
import { IIssueContext } from './IIssueContext';
import { formatIssueUrl } from './IssueReporter';

const errorMessage = 'An error occurred while installing .NET';
const reportOption = 'Report an issue';
const hideOption = 'Don\'t show again';
let showMessage = true;

export function callWithErrorHandling<T>(callback: () => T, context: IIssueContext): T | undefined {
    try {
        return callback();
    } catch (error) {
        if (error.constructor.name !== 'UserCancelledError' && showMessage) {
            window.showErrorMessage(`${errorMessage}: ${ error.message }`, reportOption, hideOption).then(async (response: string | undefined) => {
                if (response === hideOption) {
                    showMessage = false;
                } else if (response === reportOption) {
                    const [url, issueBody] = formatIssueUrl(error, context);
                    await env.clipboard.writeText(issueBody);
                    open(url);
                }
            });
        }
        return undefined;
    } finally {
        context.logger.dispose();
    }
}
