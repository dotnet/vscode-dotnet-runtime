/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DotnetAcquisitionError } from './EventStreamEvents';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';

export class OutputChannelObserver implements IEventStreamObserver {
    constructor(private readonly outputChannel: vscode.OutputChannel) {
    }

    public post(event: IEvent): void {
        switch (event.type) {
            case EventType.DotnetAcquisitionStart:
                this.outputChannel.appendLine('Downloading .NET Core tooling...');
                this.outputChannel.appendLine('');
                break;
            case EventType.DotnetAcquisitionCompleted:
                this.outputChannel.appendLine('.NET Core tooling installed!');
                break;
            case EventType.DotnetAcquisitionError:
                const error = event as DotnetAcquisitionError;
                this.outputChannel.appendLine('Error occurred when downloing .NET Core tooling:');
                this.outputChannel.appendLine(error.getErrorMessage());
                break;
        }
    }
}
