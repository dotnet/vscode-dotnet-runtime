/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionError,
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
                this.outputChannel.append('Downloading the .NET Runtime.');
                this.outputChannel.appendLine('');
                break;
            case EventType.DotnetSDKAcquisitionStart:
                this.outputChannel.append('Downloading the .NET SDK.');
                this.outputChannel.appendLine('');
                break;
            case EventType.DotnetAcquisitionStart:
                const acquisitionStarted = event as DotnetAcquisitionStarted;

                this.inProgressDownloads.push(acquisitionStarted.version);

                if (this.inProgressDownloads.length > 1) {
                    // Already a download in progress
                    this.outputChannel.appendLine(` -- Concurrent download of '${acquisitionStarted.version}' started!`);
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
                this.outputChannel.appendLine(`.NET ${acquisitionCompleted.version} executable path: ${acquisitionCompleted.dotnetPath}`);
                this.outputChannel.appendLine('');

                this.inProgressVersionDone(acquisitionCompleted.version);

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
            case EventType.DotnetAcquisitionError:
                const error = event as DotnetAcquisitionError;
                this.outputChannel.appendLine(' Error!');
                if (error instanceof DotnetAcquisitionVersionError) {
                    this.outputChannel.appendLine(`Failed to download .NET ${error.version}:`);
                }
                this.outputChannel.appendLine(error.error.message);
                this.outputChannel.appendLine('');

                if (error instanceof DotnetAcquisitionVersionError) {
                    this.inProgressVersionDone(error.version);
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
