/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as cp from 'child_process';
import * as acquisitionLibrary from 'dotnetcore-acquisition-library';
import * as path from 'path';
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

    acquisitionLibrary.activate(context, 'ms-vscode.sample-extension');

    // --------------------------------------------------------------------------

    const sampleHelloWorldRegistration = vscode.commands.registerCommand('sample.helloworld', async () => {
        try {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');

            // Console app requires .NET Core 2.2.0
            const dotnetPath = await vscode.commands.executeCommand<string>('dotnet.acquire', '2.2.0');
            if (!dotnetPath) {
                throw new Error('Couldn\'t resolve the dotnet path!');
            }

            const sampleExtension = vscode.extensions.getExtension('ms-vscode.sample-extension');
            if (!sampleExtension) {
                throw new Error('Could not find sample extension.');
            }
            const helloWorldLocation = path.join(sampleExtension.extensionPath, 'HelloWorldConsoleApp', 'HelloWorldConsoleApp.dll');
            const helloWorldArgs = [helloWorldLocation];

            // This will install any missing Linux dependencies.
            await vscode.commands.executeCommand('dotnet.ensureDotnetDependencies', dotnetPath, helloWorldArgs);

            const result = cp.spawnSync(dotnetPath, helloWorldArgs);
            const stderr = result.stderr.toString();
            if (result.stderr.toString().length > 0) {
                vscode.window.showErrorMessage(`Failed to run Hello World:
${stderr}`);
                return;
            }

            const appOutput = result.stdout.toString();
            vscode.window.showInformationMessage(`.NET Core Output: ${appOutput}`);
        } catch (error) {
            vscode.window.showErrorMessage(error.toString());
        }
    });

    const sampleAcquireRegistration = vscode.commands.registerCommand('sample.dotnet.acquire', async (version) => {
        if (!version) {
            version = await vscode.window.showInputBox({
                placeHolder: '2.2.0',
                value: '2.2.0',
                prompt: '.NET Core version, i.e. 2.2.1',
            });
        }

        try {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
            await vscode.commands.executeCommand('dotnet.acquire', version);
        } catch (error) {
            vscode.window.showErrorMessage(error.toString());
        }
    });
    const sampleDotnetUninstallAllRegistration = vscode.commands.registerCommand('sample.dotnet.uninstallAll', async () => {
        try {
            await vscode.commands.executeCommand('dotnet.uninstallAll');
            vscode.window.showInformationMessage('.NET Core tooling uninstalled.');
        } catch (error) {
            vscode.window.showErrorMessage(error.toString());
        }
    });
    const sampleshowAcquisitionLogRegistration = vscode.commands.registerCommand('sample.dotnet.showAcquisitionLog', async () => {
        try {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
        } catch (error) {
            vscode.window.showErrorMessage(error.toString());
        }
    });

    context.subscriptions.push(
        sampleHelloWorldRegistration,
        sampleAcquireRegistration,
        sampleDotnetUninstallAllRegistration,
        sampleshowAcquisitionLogRegistration);
}
