/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IEvent } from './IEvent';

export interface IEventStreamObserver extends vscode.Disposable {
    post(event: IEvent): void;
    dispose(): void;
}
