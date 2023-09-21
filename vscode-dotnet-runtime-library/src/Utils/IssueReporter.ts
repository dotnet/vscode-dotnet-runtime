/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/import { sanitize } from './ContentSantizer';
import { IIssueContext } from './IIssueContext';
// tslint:disable no-var-requires
const packageJson = require('../../package.json');

const issuesUrl = `https://github.com/dotnet/vscode-dotnet-runtime/issues/new/choose`;

export function formatIssueUrl(error: Error | undefined, context: IIssueContext): [ string, string ] {
    context.logger.dispose(); // Ensure log file is up to date

    const errorMessage = !error ? '' : `**Error Message:** ${ sanitize(error!.message) }
**Error Stack:** ${ error.stack === undefined ? '' : sanitize(error!.stack!) }`;
    const issueBody = `<!-- IMPORTANT: Please be sure to remove any private information before submitting. -->

Please attach the log file located at ${ context.logger.getFileLocation() }. Note that this file may contain personal data.

**Extension Version:** ${ packageJson.version }
${ errorMessage }`;

    return [issuesUrl, issueBody];
}
