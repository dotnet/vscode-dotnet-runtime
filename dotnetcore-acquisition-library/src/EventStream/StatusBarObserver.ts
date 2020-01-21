/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';

enum StatusBarColors {
    Red = 'rgb(218,0,0)',
    Green = 'rgb(0,218,0)',
}

export class StatusBarObserver implements IEventStreamObserver {
    constructor(private readonly statusBarItem: vscode.StatusBarItem) {
    }

    public post(event: IEvent): void {
        switch (event.type) {
            case EventType.DotnetAcquisitionStart:
                this.setAndShowStatusBar('$(cloud-download) Downloading .NET Core tooling...', 'dotnet.showAcquisitionLog', '', 'Downloading .NET Core tooling...');
                break;
            case EventType.DotnetAcquisitionCompleted:
                this.resetAndHideStatusBar();
                break;
            case EventType.DotnetAcquisitionError:
                this.setAndShowStatusBar('$(alert) Error acquiring .NET Core tooling!', 'dotnet.showAcquisitionLog', StatusBarColors.Red, 'Error acquiring .NET Core tooling');
                break;
        }
    }

    public dispose(): void {
        // Nothing to dispose

    }

    public setAndShowStatusBar(text: string, command: string, color?: string, tooltip?: string) {
        this.statusBarItem.text = text;
        this.statusBarItem.command = command;
        this.statusBarItem.color = color;
        this.statusBarItem.tooltip = tooltip;
        this.statusBarItem.show();
    }

    public resetAndHideStatusBar() {
        this.statusBarItem.text = '';
        this.statusBarItem.command = undefined;
        this.statusBarItem.color = undefined;
        this.statusBarItem.tooltip = undefined;
        this.statusBarItem.hide();
    }
}
