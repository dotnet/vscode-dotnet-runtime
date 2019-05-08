/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as acquisitionLibrary from 'dotnetcore-acquisition-library';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    // --------------------------------------------------------------------------

    /*

    NOTE: This sample should technically have the following in its package.json:

    "extensionDependencies": [
        "ms-vscode.dotnetcore-acquisition"
    ]

    This would enable the sample to require the dotnetcore-acquisition extension
    at which point VSCode would ensure that extension dependencies were satisfied
    on install and it would take care of activating it. Since we can't make that
    work fluently at dev time we manually activate it here.

    */

    acquisitionLibrary.activate(context, 'ms-vscode.sample');

    // --------------------------------------------------------------------------

    const sampleAcquireRegistration = vscode.commands.registerCommand('sample.dotnet.acquire', async (version) => {
        if (!version) {
            version = await vscode.window.showInputBox({
                placeHolder: '2.2.0',
                value: '2.2.0',
                prompt: '.NET Core version, i.e. 2.2.1',
            });
        }

        await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
        return vscode.commands.executeCommand('dotnet.acquire', version);
    });
    const dotnetUninstallAllRegistration = vscode.commands.registerCommand('sample.dotnet.uninstallAll', () => vscode.commands.executeCommand('dotnet.uninstallAll'));
    const showOutputChannelRegistration = vscode.commands.registerCommand('sample.dotnet.showAcquisitionLog', () => vscode.commands.executeCommand('dotnet.showAcquisitionLog'));

    context.subscriptions.push(
        sampleAcquireRegistration,
        dotnetUninstallAllRegistration,
        showOutputChannelRegistration);
}
