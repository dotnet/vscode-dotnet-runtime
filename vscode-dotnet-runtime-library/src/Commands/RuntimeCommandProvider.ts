/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import * as os from 'os';
import { DotnetCoreDependencyInstaller } from '../Acquisition/DotnetCoreDependencyInstaller';
import { IDotnetCoreAcquisitionWorker } from '../Acquisition/IDotnetCoreAcquisitionWorker';
import { IVersionResolver } from '../Acquisition/IVersionResolver';
import { EventStream } from '../EventStream/EventStream';
import { DotnetAcquisitionMissingLinuxDependencies, DotnetAcquisitionRequested, DotnetExistingPathResolutionCompleted } from '../EventStream/EventStreamEvents';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IDotnetEnsureDependenciesContext } from '../IDotnetEnsureDependenciesContext';
import { IDotnetUninstallContext } from '../IDotnetUninstallContext';
import { callWithErrorHandling } from '../Utils/ErrorHandler';
import { IExtensionConfigurationWorker } from '../Utils/IExtensionConfigurationWorker';
import { BaseCommandProvider } from './BaseCommandProvider';
import { commandKeys, ICommand, IExtensionCommandContext, IssueContextCallback } from './ICommandProvider';

export class RuntimeCommandProvider extends BaseCommandProvider {
    public GetExtensionCommands(context: IExtensionCommandContext): ICommand[] {
        return [
            this.getUninstallAllCommand(context.acquisitionWorker, context.issueContext),
            this.getEnsureDependenciesCommand(context.eventStream, context.issueContext),
            this.getReportIssueCommand(context.issueContext),
            this.getAcquireCommand(context.acquisitionWorker, context.extensionConfigWorker, context.displayWorker, context.versionResolver, context.eventStream, context.issueContext),
        ];
    }

    private getAcquireCommand(acquisitionWorker: IDotnetCoreAcquisitionWorker,
                              extensionConfigWorker: IExtensionConfigurationWorker,
                              displayWorker: IWindowDisplayWorker,
                              versionResolver: IVersionResolver,
                              eventStream: EventStream,
                              issueContext: IssueContextCallback): ICommand {
        return {
            name: commandKeys.acquire,
            callback: async (commandContext: IDotnetAcquireContext) => {
                const dotnetPath = await callWithErrorHandling<Promise<IDotnetAcquireResult>>(async () => {
                    eventStream.post(new DotnetAcquisitionRequested(commandContext.version, commandContext.requestingExtensionId));

                    if (!commandContext.version || commandContext.version === 'latest') {
                        throw new Error(`Cannot acquire .NET Runtime version "${commandContext.version}". Please provide a valid version.`);
                    }

                    const existingPath = acquisitionWorker.resolveExistingPath(extensionConfigWorker.getPathConfigurationValue(), commandContext.requestingExtensionId, displayWorker);
                    if (existingPath) {
                        eventStream.post(new DotnetExistingPathResolutionCompleted(existingPath.dotnetPath));
                        return new Promise((resolve) => {
                            resolve(existingPath);
                        });
                    }

                    const version = await versionResolver.getFullRuntimeVersion(commandContext.version);
                    return acquisitionWorker.acquireRuntime(version);
                }, issueContext(commandContext.errorConfiguration, 'acquire', commandContext.version), commandContext.requestingExtensionId);
                return dotnetPath;
            },
        };
    }

    private getUninstallAllCommand(acquisitionWorker: IDotnetCoreAcquisitionWorker, issueContext: IssueContextCallback): ICommand {
        return {
            name: commandKeys.uninstallAll,
            callback: async (commandContext: IDotnetUninstallContext | undefined) => {
                await callWithErrorHandling(async () => acquisitionWorker.uninstallAll(), issueContext(commandContext ? commandContext.errorConfiguration : undefined, 'uninstallAll'));
            },
        };
    }

    private getEnsureDependenciesCommand(eventStream: EventStream, issueContext: IssueContextCallback): ICommand {
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
}
