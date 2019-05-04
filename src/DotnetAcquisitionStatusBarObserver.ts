/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';

export class DotnetAcquisitionStatusBarObserver implements IEventStreamObserver {
    constructor(private readonly statusBarItem: vscode.StatusBarItem) {
    }

    public post(event: IEvent): void {
        switch (event.type) {
            case EventType.DotnetAcquisitionStart:
                this.setAndShowStatusBar('$(cloud-download) Downloading packages', '', '', 'Downloading .NET Core tooling...' );
                break;
        }
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
