/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import {
    DotnetAcquisitionAlreadyInstalled,
    DotnetAcquisitionCompleted,
    DotnetAcquisitionError,
    DotnetAcquisitionInProgress,
    DotnetAcquisitionStarted,
    DotnetAcquisitionVersionError,
    DotnetDebuggingMessage,
    DotnetExistingPathResolutionCompleted,
} from './EventStreamEvents';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';

export class OutputChannelObserver implements IEventStreamObserver {
    private readonly inProgressDownloads: string[] = [];
    private downloadProgressInterval: NodeJS.Timeout | undefined;

    // private inProgressDownloads:
    constructor(private readonly outputChannel: vscode.OutputChannel) {
    }

    public post(event: IEvent): void
    {
        switch (event.type)
        {
            case EventType.DotnetRuntimeAcquisitionStart:
                const runtimeAcquisitionStarted = event as DotnetAcquisitionStarted;
                this.outputChannel.append(`${runtimeAcquisitionStarted.requestingExtensionId} requested to download the .NET Runtime.`);
                this.outputChannel.appendLine('');
                break;
            case EventType.DotnetSDKAcquisitionStart:
                const sdkAcquisitionStarted = event as DotnetAcquisitionStarted;
                this.outputChannel.append(`${sdkAcquisitionStarted.requestingExtensionId} requested to download the .NET SDK.`);
                this.outputChannel.appendLine('');
                break;
            case EventType.DotnetAcquisitionStart:
                const acquisitionStarted = event as DotnetAcquisitionStarted;

                this.inProgressDownloads.push(acquisitionStarted.installKey);

                if (this.inProgressDownloads.length > 1) {
                    // Already a download in progress
                    this.outputChannel.appendLine(` -- Concurrent download of '${acquisitionStarted.installKey}' started!`);
                    this.outputChannel.appendLine('');
                } else {
                    this.startDownloadIndicator();
                }

                const startVersionString = this.inProgressDownloads.join(', ');
                this.outputChannel.append(`Downloading .NET version(s) ${startVersionString} ...`);
                break;
            case EventType.DotnetAcquisitionCompleted:
                const acquisitionCompleted = event as DotnetAcquisitionCompleted;
                this.outputChannel.appendLine(' Done!');
                this.outputChannel.appendLine(`.NET ${acquisitionCompleted.installKey} executable path: ${acquisitionCompleted.dotnetPath}`);
                this.outputChannel.appendLine('');

                this.inProgressVersionDone(acquisitionCompleted.installKey);

                if (this.inProgressDownloads.length > 0) {
                    const completedVersionString = `'${this.inProgressDownloads.join('\', \'')}'`;
                    this.outputChannel.append(`Still downloading .NET version(s) ${completedVersionString} ...`);
                } else {
                    this.stopDownloadIndicator();
                }
                break;
            case EventType.DotnetAcquisitionSuccessEvent:
                if (event instanceof DotnetExistingPathResolutionCompleted) {
                    this.outputChannel.append(`Using configured .NET path: ${ (event as DotnetExistingPathResolutionCompleted).resolvedPath }\n`);
                }
                break;
            case EventType.DotnetAcquisitionAlreadyInstalled:
                if(event instanceof DotnetAcquisitionAlreadyInstalled)
                {
                    this.outputChannel.append(`${
                        (event as DotnetAcquisitionAlreadyInstalled).requestingExtensionId
                    } wants to install .NET ${
                        (event as DotnetAcquisitionAlreadyInstalled).installKey
                    } but it already exists. No downloads or changes were made.\n`);
                }
                break;
            case EventType.DotnetAcquisitionInProgress:
                if(event instanceof DotnetAcquisitionInProgress)
                {
                    this.outputChannel.append(`${
                        (event as DotnetAcquisitionInProgress).requestingExtensionId
                    } tried to install .NET ${
                        (event as DotnetAcquisitionInProgress).installKey
                    } but that install had already been requested. No downloads or changes were made.\n`);
                }
                break;
            case EventType.DotnetAcquisitionError:
                const error = event as DotnetAcquisitionError;
                this.outputChannel.appendLine(' Error!');
                if (error instanceof DotnetAcquisitionVersionError) {
                    this.outputChannel.appendLine(`Failed to download .NET ${error.installKey}:`);
                }
                this.outputChannel.appendLine(error.error.message);
                this.outputChannel.appendLine('');

                if(error.installKey && error.installKey !== 'null')
                {
                    this.inProgressVersionDone(error.installKey);
                }

                if (this.inProgressDownloads.length > 0) {
                    const errorVersionString = this.inProgressDownloads.join(', ');
                    this.outputChannel.append(`Still downloading .NET version(s) ${errorVersionString} ...`);
                } else {
                    this.stopDownloadIndicator();
                }
                break;
            case EventType.DotnetDebuggingMessage:
                const loggedMessage = event as DotnetDebuggingMessage;
                this.outputChannel.appendLine(loggedMessage.message);
                break;
        }
    }

    public dispose(): void {
        // Nothing to dispose
    }

    private startDownloadIndicator() {
        this.downloadProgressInterval = setInterval(() => this.outputChannel.append('.'), 1000);
    }

    private stopDownloadIndicator() {
        if (this.downloadProgressInterval) {
            clearTimeout(this.downloadProgressInterval);
            this.downloadProgressInterval = undefined;
        }
    }

    private inProgressVersionDone(version: string) {
        const index = this.inProgressDownloads.indexOf(version);
        this.inProgressDownloads.splice(index, 1);
    }
}
