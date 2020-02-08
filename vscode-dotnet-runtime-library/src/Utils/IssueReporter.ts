/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IIssueContext } from './IIssueContext';

const issuesUrl = `https://github.com/dotnet/vscode-dotnet-runtime/issues`;

export function formatIssueUrl(error: Error, context: IIssueContext): string {
    context.logger.dispose(); // Ensure log file is up to date
    const issueBody = `<!-- IMPORTANT: Please be sure to remove any private information before submitting and attach the log file located at ${ context.logger.getFileLocation() }. -->

**Repro steps:**

1.

**Error:** ${ error.stack }`;

    const url = `${issuesUrl}/new?body=${encodeURIComponent(issueBody)}`;
    return url;
}
