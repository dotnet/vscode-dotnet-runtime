"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const DotnetAcquisitionStatusBarObserver_1 = require("./DotnetAcquisitionStatusBarObserver");
const DotnetAcquisitionWorker_1 = require("./DotnetAcquisitionWorker");
const DotnetAcquistionId_1 = require("./DotnetAcquistionId");
const EventStream_1 = require("./EventStream");
function activate(context) {
    const extension = vscode.extensions.getExtension(DotnetAcquistionId_1.dotnetAcquisitionExtensionId);
    if (!extension) {
        throw new Error('Could not resolve dotnet acquisition extension location.');
    }
    const eventStreamObservers = [
        new DotnetAcquisitionStatusBarObserver_1.DotnetAcquisitionStatusBarObserver(vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_VALUE)),
    ];
    const eventStream = new EventStream_1.EventStream();
    for (const observer of eventStreamObservers) {
        eventStream.subscribe(event => observer.post(event));
    }
    const acquisitionWorker = new DotnetAcquisitionWorker_1.DotnetAcquisitionWorker(extension.extensionPath, eventStream);
    const acquireDotnetRegistration = vscode.commands.registerCommand('dotnet.acquire', () => acquisitionWorker.acquire());
    context.subscriptions.push(acquireDotnetRegistration);
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map