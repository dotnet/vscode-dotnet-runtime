"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const DotnetCoreAcquisitionWorker_1 = require("./DotnetCoreAcquisitionWorker");
const DotnetCoreAcquistionId_1 = require("./DotnetCoreAcquistionId");
const EventStream_1 = require("./EventStream");
const OutputChannelObserver_1 = require("./OutputChannelObserver");
const StatusBarObserver_1 = require("./StatusBarObserver");
function activate(context) {
    const extension = vscode.extensions.getExtension(DotnetCoreAcquistionId_1.dotnetCoreAcquisitionExtensionId);
    if (!extension) {
        throw new Error('Could not resolve dotnet acquisition extension location.');
    }
    const outputChannel = vscode.window.createOutputChannel('.NET Core Tooling');
    const eventStreamObservers = [
        new StatusBarObserver_1.StatusBarObserver(vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_VALUE)),
        new OutputChannelObserver_1.OutputChannelObserver(outputChannel),
    ];
    const eventStream = new EventStream_1.EventStream();
    for (const observer of eventStreamObservers) {
        eventStream.subscribe(event => observer.post(event));
    }
    const acquisitionWorker = new DotnetCoreAcquisitionWorker_1.DotnetCoreAcquisitionWorker(extension.extensionPath, eventStream);
    const dotnetAcquireRegistration = vscode.commands.registerCommand('dotnet.acquire', (version) => __awaiter(this, void 0, void 0, function* () {
        if (!version) {
            version = yield vscode.window.showInputBox({
                placeHolder: '2.2.0',
                value: '2.2.0',
                prompt: '.NET Core version, i.e. 2.2.1',
            });
        }
        if (!version || version === 'latest') {
            vscode.window.showErrorMessage(`Cannot acquire .NET Core version "${version}". Please provide a valid version.`);
            return;
        }
        acquisitionWorker.acquire(version);
    }));
    const dotnetUninstallAllRegistration = vscode.commands.registerCommand('dotnet.uninstallAll', () => acquisitionWorker.uninstallAll());
    const showOutputChannelRegistration = vscode.commands.registerCommand('dotnet.showOutputChannel', () => outputChannel.show(/* preserveFocus */ false));
    context.subscriptions.push(dotnetAcquireRegistration, dotnetUninstallAllRegistration, showOutputChannelRegistration);
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map