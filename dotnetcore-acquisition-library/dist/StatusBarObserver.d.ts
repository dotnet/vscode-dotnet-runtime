import * as vscode from 'vscode';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';
export declare class StatusBarObserver implements IEventStreamObserver {
    private readonly statusBarItem;
    constructor(statusBarItem: vscode.StatusBarItem);
    post(event: IEvent): void;
    setAndShowStatusBar(text: string, command: string, color?: string, tooltip?: string): void;
    resetAndHideStatusBar(): void;
}
