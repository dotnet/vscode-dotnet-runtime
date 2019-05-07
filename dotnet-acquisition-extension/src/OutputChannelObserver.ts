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
    private downloadProgressInterval: NodeJS.Timeout | undefined;
    constructor(private readonly outputChannel: vscode.OutputChannel) {
    }

    public post(event: IEvent): void {
        switch (event.type) {
            case EventType.DotnetAcquisitionStart:
                const acquisitionStarted = event as DotnetAcquisitionStarted;
                this.outputChannel.append(`Downloading .NET Core tooling '${acquisitionStarted.version}'...`);
                this.startDownloadIndicator();
                break;
            case EventType.DotnetAcquisitionCompleted:
                const acquisitionCompleted = event as DotnetAcquisitionCompleted;
                this.stopDownladIndicator();
                this.outputChannel.appendLine(' Done!');
                this.outputChannel.appendLine(`.NET Core executable path: ${acquisitionCompleted.dotnetPath}`);
                this.outputChannel.appendLine('');
                break;
            case EventType.DotnetAcquisitionError:
                const error = event as DotnetAcquisitionError;
                this.stopDownladIndicator();
                this.outputChannel.appendLine(' Error!');
                this.outputChannel.appendLine('Failed to download .NET Core tooling:');
                this.outputChannel.appendLine(error.getErrorMessage());
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
}
