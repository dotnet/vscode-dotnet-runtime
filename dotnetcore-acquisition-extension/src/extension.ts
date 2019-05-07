/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { dotnetCoreAcquisitionExtensionId } from './DotnetCoreAcquistionId';
import { EventStream } from './EventStream';
import { IEventStreamObserver } from './IEventStreamObserver';
import { OutputChannelObserver } from './OutputChannelObserver';
import { StatusBarObserver } from './StatusBarObserver';

export function activate(context: vscode.ExtensionContext) {
    const extension = vscode.extensions.getExtension(dotnetCoreAcquisitionExtensionId);

    if (!extension) {
        throw new Error('Could not resolve dotnet acquisition extension location.');
    }

    const outputChannel = vscode.window.createOutputChannel('.NET Core Tooling');
    const eventStreamObservers: IEventStreamObserver[] =
        [
            new StatusBarObserver(vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_VALUE)),
            new OutputChannelObserver(outputChannel),
        ];
    const eventStream = new EventStream();

    for (const observer of eventStreamObservers) {
        eventStream.subscribe(event => observer.post(event));
    }

    const acquisitionWorker = new DotnetCoreAcquisitionWorker(extension.extensionPath, eventStream);

    const dotnetAcquireRegistration = vscode.commands.registerCommand('dotnet.acquire', async (version) => {
        if (!version) {
            version = await vscode.window.showInputBox({
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
    });
    const dotnetUninstallAllRegistration = vscode.commands.registerCommand('dotnet.uninstallAll', () => acquisitionWorker.uninstallAll());
    const showOutputChannelRegistration = vscode.commands.registerCommand('dotnet.showOutputChannel', () => outputChannel.show(/* preserveFocus */ false));

    context.subscriptions.push(
        dotnetAcquireRegistration,
        dotnetUninstallAllRegistration,
        showOutputChannelRegistration);
}
