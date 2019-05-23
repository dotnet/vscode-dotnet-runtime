/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DotnetAcquisitionCompleted, DotnetAcquisitionError, DotnetAcquisitionStarted } from './EventStreamEvents';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';

export class OutputChannelObserver implements IEventStreamObserver {
    private readonly inProgressDownloads: string[] = [];
    private downloadProgressInterval: NodeJS.Timeout | undefined;

    // private inProgressDownloads: 
    constructor(private readonly outputChannel: vscode.OutputChannel) {
    }

    public post(event: IEvent): void {
        switch (event.type) {
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
                
                const versionString = this.inProgressDownloads.join(', ');
                this.outputChannel.append(`Downloading .NET Core tooling version(s) ${versionString} ...`);
                break;
            case EventType.DotnetAcquisitionCompleted:
                const acquisitionCompleted = event as DotnetAcquisitionCompleted;
                this.outputChannel.appendLine(' Done!');
                this.outputChannel.appendLine(`.NET Core ${acquisitionCompleted.version} executable path: ${acquisitionCompleted.dotnetPath}`);
                this.outputChannel.appendLine('');

                this.inProgressVersionDone(acquisitionCompleted.version);

                if (this.inProgressDownloads.length > 0) {
                    const versionString = `'${this.inProgressDownloads.join('\', \'')}'`;
                    this.outputChannel.append(`Still downloading .NET Core tooling version(s) ${versionString} ...`);
                } else {
                    this.stopDownladIndicator();
                }
                break;
            case EventType.DotnetAcquisitionError:
                const error = event as DotnetAcquisitionError;
                this.outputChannel.appendLine(' Error!');
                this.outputChannel.appendLine(`Failed to download .NET Core tooling ${error.version}:`);
                this.outputChannel.appendLine(error.getErrorMessage());
                this.outputChannel.appendLine('');

                this.inProgressVersionDone(error.version);

                if (this.inProgressDownloads.length > 0) {
                    const versionString = this.inProgressDownloads.join(', ');
                    this.outputChannel.append(`Still downloading .NET Core tooling version(s) ${versionString} ...`);
                } else {
                    this.stopDownladIndicator();
                }
                break;
        }
    }

    private startDownloadIndicator() {
        this.downloadProgressInterval = setInterval(() => this.outputChannel.append('.'), 1000);
    }

    private stopDownladIndicator() {
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
