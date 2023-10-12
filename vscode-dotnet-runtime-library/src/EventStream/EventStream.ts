/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IEvent } from './IEvent';

export interface IEventStream {
    post(event: IEvent): void;
}

export class EventStream implements IEventStream {
    private readonly subscribeEmitter: vscode.EventEmitter<IEvent>;

    constructor() {
        this.subscribeEmitter = new vscode.EventEmitter<IEvent>();
    }

    public post(event: IEvent) {
        this.subscribeEmitter.fire(event);
    }

    public get subscribe() { return this.subscribeEmitter.event; }
}
