/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import open = require('open');
import * as os from 'os';
import * as vscode from 'vscode';
import { IDotnetEnsureDependenciesContext } from '..';
import { DotnetCoreDependencyInstaller } from '../Acquisition/DotnetCoreDependencyInstaller';
import { IDotnetCoreAcquisitionWorker } from '../Acquisition/IDotnetCoreAcquisitionWorker';
import { EventStream } from '../EventStream/EventStream';
import { DotnetAcquisitionMissingLinuxDependencies } from '../EventStream/EventStreamEvents';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IDotnetUninstallContext } from '../IDotnetUninstallContext';
import { AcquireErrorConfiguration, callWithErrorHandling } from '../Utils/ErrorHandler';
import { IExtensionConfigurationWorker } from '../Utils/IExtensionConfigurationWorker';
import { formatIssueUrl } from '../Utils/IssueReporter';
import { commandKeys, ICommand, ICommandProvider, IssueContextCallback } from './ICommandProvider';

export abstract class BaseCommandProvider implements ICommandProvider {
    public abstract GetExtensionCommands(acquisitionWorker: IDotnetCoreAcquisitionWorker,
                                         extensionConfigWorker: IExtensionConfigurationWorker,
                                         displayWorker: IWindowDisplayWorker,
                                         eventStream: EventStream,
                                         issueContext: IssueContextCallback): ICommand[];

    // Shared commands
    protected getUninstallAllCommand(acquisitionWorker: IDotnetCoreAcquisitionWorker, issueContext: IssueContextCallback): ICommand {
        return {
            name: commandKeys.uninstallAll,
            callback: async (commandContext: IDotnetUninstallContext | undefined) => {
                await callWithErrorHandling(() => acquisitionWorker.uninstallAll(), issueContext(commandContext ? commandContext.errorConfiguration : undefined, 'uninstallAll'));
            },
        };
    }

    protected getEnsureDependenciesCommand(eventStream: EventStream, issueContext: IssueContextCallback): ICommand {
        return {
            name: commandKeys.ensureDotnetDependencies,
            callback: async (commandContext: IDotnetEnsureDependenciesContext) => {
                await callWithErrorHandling(async () => {
                    if (os.platform() !== 'linux') {
                        // We can't handle installing dependencies for anything other than Linux
                        return;
                    }

                    const result = cp.spawnSync(commandContext.command, commandContext.arguments);
                    const installer = new DotnetCoreDependencyInstaller();
                    if (installer.signalIndicatesMissingLinuxDependencies(result.signal)) {
                        eventStream.post(new DotnetAcquisitionMissingLinuxDependencies());
                        await installer.promptLinuxDependencyInstall('Failed to run .NET runtime.');
                    }
                }, issueContext(commandContext.errorConfiguration, 'ensureDependencies'));
            },
        };
    }

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
