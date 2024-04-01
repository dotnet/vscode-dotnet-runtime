/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
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
    constructor(private readonly statusBarItem: vscode.StatusBarItem, private readonly showLogCommand: string) {
    }

    public post(event: IEvent): void {
        switch (event.type) {
            case EventType.DotnetAcquisitionStart:
                this.setAndShowStatusBar('$(cloud-download) Downloading .NET...', this.showLogCommand, '', 'Downloading .NET...');
                break;
            case EventType.DotnetAcquisitionCompleted:
            case EventType.DotnetInstallExpectedAbort:
                this.resetAndHideStatusBar();
                break;
            case EventType.DotnetAcquisitionError:
                this.setAndShowStatusBar('$(alert) Error acquiring .NET!', this.showLogCommand, StatusBarColors.Red, 'Error acquiring .NET');
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
