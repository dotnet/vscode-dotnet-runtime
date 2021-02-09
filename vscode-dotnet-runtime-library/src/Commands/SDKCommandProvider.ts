/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as vscode from 'vscode';
import { IDotnetCoreAcquisitionWorker } from '../Acquisition/IDotnetCoreAcquisitionWorker';
import { IVersionResolver } from '../Acquisition/IVersionResolver';
import { EventStream } from '../EventStream/EventStream';
import { DotnetAcquisitionRequested } from '../EventStream/EventStreamEvents';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';
import { IDotnetUninstallContext } from '../IDotnetUninstallContext';
import { callWithErrorHandling } from '../Utils/ErrorHandler';
import { BaseCommandProvider } from './BaseCommandProvider';
import { commandKeys, ICommand, IExtensionCommandContext, IssueContextCallback } from './ICommandProvider';

export class SDKCommandProvider extends BaseCommandProvider {
    public GetExtensionCommands(context: IExtensionCommandContext): ICommand[] {
        return [
            this.getUninstallAllCommand(context.acquisitionWorker, context.displayWorker, context.issueContext),
            this.getReportIssueCommand(context.issueContext),
            this.getAcquireCommand(context.acquisitionWorker, context.displayWorker, context.versionResolver, context.eventStream, context.issueContext),
        ];
    }

    protected getUninstallAllCommand(acquisitionWorker: IDotnetCoreAcquisitionWorker,
                                     displayWorker: IWindowDisplayWorker,
                                     issueContext: IssueContextCallback): ICommand {
        return {
            name: commandKeys.uninstallAll,
            callback: async (commandContext: IDotnetUninstallContext | undefined) => {
                await callWithErrorHandling(async () => {
                    await acquisitionWorker.uninstallAll();
                    displayWorker.showInformationMessage('All VS Code copies of the .NET SDK uninstalled.', () => { /* No callback needed */ });
                }, issueContext(commandContext ? commandContext.errorConfiguration : undefined, 'uninstallAll'));
            },
        };
    }

    private getAcquireCommand(acquisitionWorker: IDotnetCoreAcquisitionWorker,
                              displayWorker: IWindowDisplayWorker,
                              versionResolver: IVersionResolver,
                              eventStream: EventStream,
                              issueContext: IssueContextCallback): ICommand {
        return {
            name: commandKeys.acquire,
            callback: async (commandContext?: IDotnetAcquireContext) => {
                return callWithErrorHandling(async () => {
                    let version: string | undefined = commandContext ? commandContext.version : undefined;
                    if (!version) {
                        version = await vscode.window.showInputBox({
                            placeHolder: '5.0',
                            value: '5.0',
                            prompt: '.NET version, i.e. 5.0',
                        });
                    }
                    if (!version) {
                        displayWorker.showErrorMessage('No .NET SDK version provided', () => { /* No callback needed */ });
                        return undefined;
                    }

                    eventStream.post(new DotnetAcquisitionRequested(version!));
                    const resolvedVersion = await versionResolver.getFullSDKVersion(version!);
                    const dotnetPath = await acquisitionWorker.acquireSDK(resolvedVersion);
                    displayWorker.showInformationMessage(`.NET SDK ${version} installed to ${dotnetPath.dotnetPath}`, () => { /* No callback needed */ });
                    // TODO add to PATH?
                    return dotnetPath;
                }, issueContext(undefined, 'acquireSDK'));
            },
        };
    }
}
