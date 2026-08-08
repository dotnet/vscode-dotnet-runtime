/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionFinalError,
    DotnetAcquisitionStarted,
    DotnetInstallExpectedAbort,
} from './EventStreamEvents';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';

enum StatusBarColors {
    Red = 'rgb(218,0,0)',
    Green = 'rgb(0,218,0)',
}

export class StatusBarObserver implements IEventStreamObserver {
    // Use a Set so duplicate start events for the same installId (possible in the global SDK path,
    // where DotnetAcquisitionStarted fires before the inner installer lock) are naturally deduplicated.
    private readonly inProgressDownloads: Set<string> = new Set<string>();

    constructor(private readonly statusBarItem: vscode.StatusBarItem, private readonly showLogCommand: string) {
    }

    public post(event: IEvent): void {
        switch (event.type) {
            case EventType.DotnetAcquisitionStart:
                const acquisitionStarted = event as DotnetAcquisitionStarted;
                this.inProgressDownloads.add(acquisitionStarted.install.installId);
                this.setAndShowStatusBar('$(cloud-download) Downloading .NET...', this.showLogCommand, '', 'Downloading .NET...');
                break;
            case EventType.DotnetAcquisitionCompleted:
                const acquisitionCompleted = event as DotnetAcquisitionCompleted;
                this.removeFromInProgress(acquisitionCompleted.install.installId);
                if (this.inProgressDownloads.size === 0) {
                    this.resetAndHideStatusBar();
                }
                break;
            case EventType.DotnetInstallExpectedAbort:
                const abortEvent = event as DotnetInstallExpectedAbort;
                this.removeFromInProgress(abortEvent.install?.installId);
                if (this.inProgressDownloads.size === 0) {
                    this.resetAndHideStatusBar();
                }
                break;
            case EventType.DotnetAcquisitionFinalError:
                const finalError = event as DotnetAcquisitionFinalError;
                this.removeFromInProgress(finalError.install?.installId);
                if (this.inProgressDownloads.size === 0) {
                    this.resetAndHideStatusBar();
                }
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

    private removeFromInProgress(installId: string | null | undefined): void {
        if (installId)
        {
            this.inProgressDownloads.delete(installId);
        }
    }
}
