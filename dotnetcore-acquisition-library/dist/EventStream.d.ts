import * as vscode from 'vscode';
import { IEvent } from './IEvent';
export declare class EventStream {
    private readonly subscribeEmitter;
    constructor();
    post(event: IEvent): void;
    readonly subscribe: vscode.Event<IEvent>;
}
