/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    IDotnetAcquireContext,
    IDotnetAcquireResult,
    IDotnetListVersionsResult,
    IDotnetVersion
} from 'vscode-dotnet-runtime-library';
import * as runtimeExtension from 'vscode-dotnet-runtime';
import * as sdkExtension from 'vscode-dotnet-sdk';

export function activate(context: vscode.ExtensionContext) {

    // --------------------------------------------------------------------------

    /*

    NOTE: This sample should technically have the following in its package.json:

    "extensionDependencies": [
        "ms-dotnettools.vscode-dotnet-runtime",
        "ms-dotnettools.vscode-dotnet-sdk"
    ]

    This would enable the sample to require the vscode-dotnet-runtime extension
    at which point VSCode would ensure that extension dependencies were satisfied
    on install and it would take care of activating it. Since we can't make that
    work fluently at dev time we manually activate it here.

    */

    const requestingExtensionId = 'ms-dotnettools.sample-extension';
    runtimeExtension.activate(context);
    sdkExtension.activate(context);


    // --------------------------------------------------------------------------

    // -------------------runtime extension registrations------------------------

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
            vscode.window.showErrorMessage((error as Error).toString());
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
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleAcquireStatusRegistration = vscode.commands.registerCommand('sample.dotnet.acquireStatus', async (version) => {
        if (!version) {
            version = await vscode.window.showInputBox({
                placeHolder: '3.1',
                value: '3.1',
                prompt: '.NET version, i.e. 3.1',
            });
        }

        try {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
            const status = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquireStatus', { version, requestingExtensionId });
            vscode.window.showInformationMessage(status === undefined ? '.NET is not installed' :`.NET version ${version} installed at ${status.dotnetPath}`);
        } catch (error) {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });
    
    const sampleDotnetUninstallAllRegistration = vscode.commands.registerCommand('sample.dotnet.uninstallAll', async () => {
        try {
            await vscode.commands.executeCommand('dotnet.uninstallAll');
            vscode.window.showInformationMessage('.NET runtimes uninstalled.');
        } catch (error) {
            vscode.window.showErrorMessage((error as Error).toString());
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
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleShowAcquisitionLogRegistration = vscode.commands.registerCommand('sample.dotnet.showAcquisitionLog', async () => {
        try {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
        } catch (error) {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    context.subscriptions.push(
        sampleHelloWorldRegistration,
        sampleAcquireRegistration,
        sampleAcquireStatusRegistration,
        sampleDotnetUninstallAllRegistration,
        sampleConcurrentTest,
        sampleShowAcquisitionLogRegistration,
    );

    // --------------------------------------------------------------------------

    // ---------------------sdk extension registrations--------------------------

    const sampleSDKAcquireRegistration = vscode.commands.registerCommand('sample.dotnet-sdk.acquire', async (version) => {
        if (!version) {
            version = await vscode.window.showInputBox({
                placeHolder: '5.0',
                value: '5.0',
                prompt: '.NET SDK version, i.e. 5.0',
            });
        }

        try {
            await vscode.commands.executeCommand('dotnet-sdk.showAcquisitionLog');
            await vscode.commands.executeCommand('dotnet-sdk.acquire', { version, requestingExtensionId });
        } catch (error) {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKGlobalAcquireRegistration = vscode.commands.registerCommand('sample.dotnet-sdk.acquireGlobal', async (version) => {
        if (!version) {
            version = await vscode.window.showInputBox({
                placeHolder: '7.0.103',
                value: '7.0.103',
                prompt: 'The .NET SDK version. You can use different formats: 5, 3.1, 7.0.3xx, 6.0.201, etc.',
            });
        }

        try {
            await vscode.commands.executeCommand('dotnet-sdk.showAcquisitionLog');
            let commandContext : IDotnetAcquireContext = { version, requestingExtensionId, installType: 'global' };
            await vscode.commands.executeCommand('dotnet-sdk.acquire', commandContext);
        } catch (error) {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKAcquireStatusRegistration = vscode.commands.registerCommand('sample.dotnet-sdk.acquireStatus', async (version) => {
        if (!version) {
            version = await vscode.window.showInputBox({
                placeHolder: '5.0',
                value: '5.0',
                prompt: '.NET SDK version, i.e. 5.0',
            });
        }

        try {
            await vscode.commands.executeCommand('dotnet-sdk.showAcquisitionLog');
            const status = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquireStatus', { version, requestingExtensionId });
            vscode.window.showInformationMessage(status === undefined ? '.NET is not installed' :`.NET version ${version} installed at ${status.dotnetPath}`);
        } catch (error) {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKlistVersions = vscode.commands.registerCommand('sample.dotnet-sdk.listVersions', async (getRuntimes : boolean) => {
        if (!getRuntimes) {
            getRuntimes = JSON.parse(await vscode.window.showInputBox({
                placeHolder: 'false',
                value: 'false',
                prompt: 'Acquire Runtimes? Use `true` if so, else, give `false`.',
            }) ?? 'false');
        }

        try {
            const result : IDotnetListVersionsResult | undefined = await vscode.commands.executeCommand('dotnet-sdk.listVersions', { listRuntimes: getRuntimes });
            vscode.window.showInformationMessage(`Available ${getRuntimes == false ? 'SDKS' : 'Runtimes'}: ${result?.map(x => x.version).join(", ")}`);
        } catch (error) {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKrecommendedVersion = vscode.commands.registerCommand('sample.dotnet-sdk.recommendedVersion', async (getRuntimes : boolean) => {
        try {
            const result : IDotnetVersion | undefined = await vscode.commands.executeCommand('dotnet-sdk.recommendedVersion', { listRuntimes: getRuntimes });
            vscode.window.showInformationMessage(`Recommended SDK Version to Install: ${result?.version}`);
        } catch (error) {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKDotnetUninstallAllRegistration = vscode.commands.registerCommand('sample.dotnet-sdk.uninstallAll', async () => {
        try {
            await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
            vscode.window.showInformationMessage('.NET SDKs uninstalled.');
        } catch (error) {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKShowAcquisitionLogRegistration = vscode.commands.registerCommand('sample.dotnet-sdk.showAcquisitionLog', async () => {
        try {
            await vscode.commands.executeCommand('dotnet-sdk.showAcquisitionLog');
        } catch (error) {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    context.subscriptions.push(
        sampleSDKAcquireRegistration,
        sampleSDKGlobalAcquireRegistration,
        sampleSDKAcquireStatusRegistration,
        sampleSDKlistVersions,
        sampleSDKrecommendedVersion,
        sampleSDKDotnetUninstallAllRegistration,
        sampleSDKShowAcquisitionLogRegistration);
}
