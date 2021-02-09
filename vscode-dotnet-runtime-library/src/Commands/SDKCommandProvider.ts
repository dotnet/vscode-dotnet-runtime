/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { DotnetCoreAcquisitionWorker } from '../Acquisition/DotnetCoreAcquisitionWorker';
import { EventStream } from '../EventStream/EventStream';
import { DotnetAcquisitionRequested } from '../EventStream/EventStreamEvents';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { callWithErrorHandling } from '../Utils/ErrorHandler';
import { IExtensionConfigurationWorker } from '../Utils/IExtensionConfigurationWorker';
import { BaseCommandProvider } from './BaseCommandProvider';
import { commandKeys, ICommand, IssueContextCallback } from './ICommandProvider';

export class SDKCommandProvider extends BaseCommandProvider {
    public GetExtensionCommands(acquisitionWorker: DotnetCoreAcquisitionWorker,
                                extensionConfigWorker: IExtensionConfigurationWorker,
                                displayWorker: IWindowDisplayWorker,
                                eventStream: EventStream,
                                issueContext: IssueContextCallback): ICommand[] {
        return [
            this.getUninstallAllCommand(acquisitionWorker, issueContext),
            this.getEnsureDependenciesCommand(eventStream, issueContext),
            this.getReportIssueCommand(issueContext),
            this.getAcquireCommand(acquisitionWorker, displayWorker, eventStream, issueContext),
        ];
    }

    private getAcquireCommand(acquisitionWorker: DotnetCoreAcquisitionWorker,
                              displayWorker: IWindowDisplayWorker,
                              eventStream: EventStream,
                              issueContext: IssueContextCallback): ICommand {
        return {
            name: commandKeys.acquire,
            callback: async (commandContext: IDotnetAcquireContext) => {
                const dotnetPath = await callWithErrorHandling<Promise<IDotnetAcquireResult>>(async () => {
                    eventStream.post(new DotnetAcquisitionRequested(commandContext.version, commandContext.requestingExtensionId));

                    if (!commandContext.version || commandContext.version === 'latest') {
                            throw new Error(`Cannot acquire .NET SDK version "${commandContext.version}". Please provide a valid version.`);
                        }

                    return acquisitionWorker.acquire(commandContext.version);
                    }, issueContext(commandContext.errorConfiguration, 'acquire', commandContext.version), commandContext.requestingExtensionId);

                    // TODO add to PATH instead
                displayWorker.showWarningMessage(`SDK installed: ${dotnetPath}`, () => { /* No callback */ },
                );
            },
        };
    }
}
