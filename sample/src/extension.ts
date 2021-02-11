/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { IDotnetAcquireResult } from 'vscode-dotnet-runtime-library';
import * as extension from 'vscode-dotnet-runtime';

export function activate(context: vscode.ExtensionContext) {

    // --------------------------------------------------------------------------

    /*

    NOTE: This sample should technically have the following in its package.json:

    "extensionDependencies": [
        "ms-dotnettools.vscode-dotnet-runtime"
    ]

    This would enable the sample to require the vscode-dotnet-runtime extension
    at which point VSCode would ensure that extension dependencies were satisfied
    on install and it would take care of activating it. Since we can't make that
    work fluently at dev time we manually activate it here.

    */

    const requestingExtensionId = 'ms-dotnettools.sample-extension';
    extension.activate(context);

    // --------------------------------------------------------------------------

    const sampleHelloWorldRegistration = vscode.commands.registerCommand('sample.helloworld', async () => {
        try {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');

            // Console app requires .NET Core 2.2.0
            const commandRes = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', { version: '2.2', requestingExtensionId });
            const dotnetPath = commandRes!.dotnetPath;
            if (!dotnetPath) {
                throw new Error('Could not resolve the dotnet path!');
            }

            const sampleExtension = vscode.extensions.getExtension('ms-dotnettools.sample-extension');
            if (!sampleExtension) {
                throw new Error('Could not find sample extension.');
            }
            const helloWorldLocation = path.join(sampleExtension.extensionPath, 'HelloWorldConsoleApp', 'HelloWorldConsoleApp.dll');
            const helloWorldArgs = [helloWorldLocation];

            // This will install any missing Linux dependencies.
            await vscode.commands.executeCommand('dotnet.ensureDotnetDependencies', { command: dotnetPath, arguments: helloWorldArgs });

            const result = cp.spawnSync(dotnetPath, helloWorldArgs);
            const stderr = result.stderr.toString();
            if (stderr.length > 0) {
                vscode.window.showErrorMessage(`Failed to run Hello World:
${stderr}`);
                return;
            }

            const appOutput = result.stdout.toString();
            vscode.window.showInformationMessage(`.NET Output: ${appOutput}`);
        } catch (error) {
            vscode.window.showErrorMessage(error.toString());
        }
    });

    const sampleAcquireRegistration = vscode.commands.registerCommand('sample.dotnet.acquire', async (version) => {
        if (!version) {
            version = await vscode.window.showInputBox({
                placeHolder: '3.1',
                value: '3.1',
                prompt: '.NET version, i.e. 3.1',
            });
        }

        try {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
            await vscode.commands.executeCommand('dotnet.acquire', { version, requestingExtensionId });
        } catch (error) {
            vscode.window.showErrorMessage(error.toString());
        }
    });
    const sampleDotnetUninstallAllRegistration = vscode.commands.registerCommand('sample.dotnet.uninstallAll', async () => {
        try {
            await vscode.commands.executeCommand('dotnet.uninstallAll');
            vscode.window.showInformationMessage('.NET runtimes uninstalled.');
        } catch (error) {
            vscode.window.showErrorMessage(error.toString());
        }
    });
    const sampleConcurrentTest = vscode.commands.registerCommand('sample.dotnet.concurrentTest', async () => {
        try {
            vscode.commands.executeCommand('dotnet.showAcquisitionLog');
            const promises = [
                vscode.commands.executeCommand('dotnet.acquire', { version: '2.0', requestingExtensionId }),
                vscode.commands.executeCommand('dotnet.acquire', { version: '2.1', requestingExtensionId }),
                vscode.commands.executeCommand('dotnet.acquire', { version: '2.2', requestingExtensionId })];

            for (const promise of promises) {
                // Await here so we can detect errors
                await promise;
            }
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
        sampleConcurrentTest,
        sampleshowAcquisitionLogRegistration);
}
