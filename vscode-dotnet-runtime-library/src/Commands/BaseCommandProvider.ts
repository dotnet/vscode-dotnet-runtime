/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import open = require('open');
import * as vscode from 'vscode';
import { AcquireErrorConfiguration } from '../Utils/ErrorHandler';
import { formatIssueUrl } from '../Utils/IssueReporter';
import { commandKeys, ICommand, ICommandProvider, IExtensionCommandContext, IssueContextCallback } from './ICommandProvider';

export abstract class BaseCommandProvider implements ICommandProvider {
    public abstract GetExtensionCommands(context: IExtensionCommandContext): ICommand[];

    // Shared commands
    protected getReportIssueCommand(issueContext: IssueContextCallback): ICommand {
        return {
            name: commandKeys.reportIssue,
            callback: async () => {
                const [url, issueBody] = formatIssueUrl(undefined, issueContext(AcquireErrorConfiguration.DisableErrorPopups, 'reportIssue'));
                await vscode.env.clipboard.writeText(issueBody);
                open(url);
            },
        };
    }
}
