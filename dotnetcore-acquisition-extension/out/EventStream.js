"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
class EventStream {
    constructor() {
        this.subscribeEmitter = new vscode.EventEmitter();
    }
    post(event) {
        this.subscribeEmitter.fire(event);
    }
    get subscribe() { return this.subscribeEmitter.event; }
}
exports.EventStream = EventStream;
//# sourceMappingURL=EventStream.js.map