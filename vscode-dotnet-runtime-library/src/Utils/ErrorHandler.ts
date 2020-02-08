/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as open from 'open';
import { window } from 'vscode';
import { IIssueContext } from './IIssueContext';
import { formatIssueUrl } from './IssueReporter';

const errorMessage = 'An error occurred while installing .NET';
const reportOption = 'Report an issue';

export async function callWithErrorHandling<T>(callback: () => T, context: IIssueContext): Promise<T | undefined> {
    try {
        return await callback();
    } catch (error) {
        if (error.constructor.name !== 'UserCancelledError') {
            window.showErrorMessage(`${errorMessage}: ${ error.message }`, reportOption).then((response: string | undefined) => {
                if (response === reportOption) {
                    const url = formatIssueUrl(error, context);
                    open(url);
                }
            });
        }
        return undefined;
    }
}
