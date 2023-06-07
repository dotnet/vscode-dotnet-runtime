import * as vscode from 'vscode';
import { IEvent } from './IEvent';
export interface IEventStream {
    post(event: IEvent): void;
}
export declare class EventStream implements IEventStream {
    private readonly subscribeEmitter;
    constructor();
    post(event: IEvent): void;
    get subscribe(): vscode.Event<IEvent>;
}
