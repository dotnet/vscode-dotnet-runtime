/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IEvent } from './IEvent';

export class EventStream {
    private readonly subscribeEmitter: vscode.EventEmitter<IEvent>;

    constructor() {
        this.subscribeEmitter = new vscode.EventEmitter<IEvent>();
    }

    public post(event: IEvent) {
        this.subscribeEmitter.fire(event);
    }

    public get subscribe() { return this.subscribeEmitter.event; }
}