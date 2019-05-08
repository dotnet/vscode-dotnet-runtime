import * as vscode from 'vscode';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';
export declare class OutputChannelObserver implements IEventStreamObserver {
    private readonly outputChannel;
    private downloadProgressInterval;
    constructor(outputChannel: vscode.OutputChannel);
    post(event: IEvent): void;
    private startDownloadIndicator;
    private stopDownladIndicator;
}
