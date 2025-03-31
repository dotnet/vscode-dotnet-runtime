/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
// import * as runtimeExtension from 'vscode-dotnet-runtime'; // comment this out when packing the extension
import
{
    DotnetInstallMode,
    DotnetVersionSpecRequirement,
    IDotnetAcquireContext,
    IDotnetAcquireResult,
    IDotnetFindPathContext,
    IDotnetListVersionsResult,
} from 'vscode-dotnet-runtime-library';

export function activate(context: vscode.ExtensionContext)
{

    // --------------------------------------------------------------------------

    /*

    NOTE: This sample should technically have the following in its package.json:

    "extensionDependencies": [
        "ms-dotnettools.vscode-dotnet-runtime",
    ]

    This would enable the sample to require the vscode-dotnet-runtime extension
    */

    const requestingExtensionId = 'ms-dotnettools.sample-extension';
    // runtimeExtension.activate(context); // comment this out when packing the extension


    // --------------------------------------------------------------------------

    // -------------------runtime extension registrations------------------------

    const sampleHelloWorldRegistration = vscode.commands.registerCommand('sample.helloworld', async () =>
    {
        try
        {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');

            // Console app requires .NET Core 2.2.0
            const commandRes = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', { version: '2.2', requestingExtensionId });
            const dotnetPath = commandRes!.dotnetPath;
            if (!dotnetPath)
            {
                throw new Error('Could not resolve the dotnet path!');
            }

            const sampleExtension = vscode.extensions.getExtension('ms-dotnettools.sample-extension');
            if (!sampleExtension)
            {
                throw new Error('Could not find sample extension.');
            }
            const helloWorldLocation = path.join(sampleExtension.extensionPath, 'HelloWorldConsoleApp', 'HelloWorldConsoleApp.dll');
            const helloWorldArgs = [helloWorldLocation];

            // This will install any missing Linux dependencies.
            await vscode.commands.executeCommand('dotnet.ensureDotnetDependencies', { command: dotnetPath, arguments: helloWorldArgs });

            const result = cp.spawnSync(dotnetPath, helloWorldArgs);
            const stderr = result?.stderr?.toString();
            if ((stderr?.length ?? 0) > 0)
            {
                vscode.window.showErrorMessage(`Failed to run Hello World:
${stderr}`);
                return;
            }

            const appOutput = result?.stdout?.toString();
            vscode.window.showInformationMessage(`.NET Output: ${appOutput}`);
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    async function callAcquireAPI(version: string | undefined, installMode: DotnetInstallMode | undefined)
    {
        if (!version)
        {
            version = await vscode.window.showInputBox({
                placeHolder: '3.1',
                value: '3.1',
                prompt: '.NET version, i.e. 3.1',
            });
        }

        try
        {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
            await vscode.commands.executeCommand('dotnet.acquire', { version, requestingExtensionId, mode: installMode });
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    }

    const sampleAcquireRegistration = vscode.commands.registerCommand('sample.dotnet.acquire', async (version) =>
    {
        await callAcquireAPI(version, undefined);
    });

    const sampleAcquireASPNETRegistration = vscode.commands.registerCommand('sample.dotnet.acquireASPNET', async (version) =>
    {
        await callAcquireAPI(version, 'aspnetcore');
    });

    const sampleAcquireStatusRegistration = vscode.commands.registerCommand('sample.dotnet.acquireStatus', async (version) =>
    {
        if (!version)
        {
            version = await vscode.window.showInputBox({
                placeHolder: '3.1',
                value: '3.1',
                prompt: '.NET version, i.e. 3.1',
            });
        }

        try
        {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
            const status = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquireStatus', { version, requestingExtensionId });
            vscode.window.showInformationMessage(status === undefined ? '.NET is not installed' : `.NET version ${version} installed at ${status.dotnetPath}`);
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleDotnetUninstallAllRegistration = vscode.commands.registerCommand('sample.dotnet.uninstallAll', async () =>
    {
        try
        {
            await vscode.commands.executeCommand('dotnet.uninstallAll');
            vscode.window.showInformationMessage('.NET runtimes uninstalled.');
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    async function acquireConcurrent(versions: [string, string, string], installMode?: DotnetInstallMode)
    {
        try
        {
            vscode.commands.executeCommand('dotnet.showAcquisitionLog');
            const promises = [
                vscode.commands.executeCommand('dotnet.acquire', { version: versions[0], requestingExtensionId, mode: installMode }),
                vscode.commands.executeCommand('dotnet.acquire', { version: versions[1], requestingExtensionId, mode: installMode }),
                vscode.commands.executeCommand('dotnet.acquire', { version: versions[2], requestingExtensionId, mode: installMode })];

            for (const promise of promises)
            {
                // Await here so we can detect errors
                await promise;
            }
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    }

    const sampleConcurrentTest = vscode.commands.registerCommand('sample.dotnet.concurrentTest', async () =>
    {
        await acquireConcurrent(['2.0', '2.1', '2.2'], 'runtime');
    });

    const sampleConcurrentASPNETTest = vscode.commands.registerCommand('sample.dotnet.concurrentASPNETTest', async () =>
    {
        acquireConcurrent(['6.0', '8.0', '7.0'], 'runtime') // start this so we test concurrent types of runtime installs
        await acquireConcurrent(['6.0', '8.0', '7.0'], 'aspnetcore');
    });

    const sampleShowAcquisitionLogRegistration = vscode.commands.registerCommand('sample.dotnet.showAcquisitionLog', async () =>
    {
        try
        {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleGlobalSDKFromRuntimeRegistration = vscode.commands.registerCommand('sample.dotnet.acquireGlobalSDK', async (version) =>
    {
        if (!version)
        {
            version = await vscode.window.showInputBox({
                placeHolder: '7.0.103',
                value: '7.0.103',
                prompt: 'The .NET SDK version. You can use different formats: 5, 3.1, 7.0.3xx, 6.0.201, etc.',
            });
        }

        try
        {
            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
            let commandContext: IDotnetAcquireContext = { version: version, requestingExtensionId: requestingExtensionId, installType: 'global' };
            await vscode.commands.executeCommand('dotnet.acquireGlobalSDK', commandContext);
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleFindPathRegistration = vscode.commands.registerCommand('sample.dotnet.findPath', async () =>
    {
        const version = await vscode.window.showInputBox(
            {
                placeHolder: '8.0',
                value: '8.0',
                prompt: 'The .NET runtime version.',
            });

        let arch = await vscode.window.showInputBox({
            placeHolder: 'x64',
            value: 'x64',
            prompt: 'The .NET runtime architecture.',
        });

        arch = arch?.toLowerCase();

        let searchMode = await vscode.window.showInputBox({
            placeHolder: 'runtime',
            value: 'runtime',
            prompt: 'look for an sdk, runtime, aspnetcore runtime, etc',
        });

        searchMode = searchMode?.toLowerCase() ?? 'runtime';

        let requirement = await vscode.window.showInputBox({
            placeHolder: 'greater_than_or_equal',
            value: 'greater_than_or_equal',
            prompt: 'The condition to search for a requirement.',
        });

        requirement = requirement?.toLowerCase();

        let commandContext: IDotnetFindPathContext = {
            acquireContext: { version: version, requestingExtensionId: requestingExtensionId, architecture: arch, mode: searchMode } as IDotnetAcquireContext,
            versionSpecRequirement: requirement as DotnetVersionSpecRequirement
        };

        const result = await vscode.commands.executeCommand('dotnet.findPath', commandContext);

        vscode.window.showInformationMessage(`.NET Path Discovered\n
${JSON.stringify(result) ?? 'undefined'}`);
    });

    context.subscriptions.push(
        sampleHelloWorldRegistration,
        sampleAcquireRegistration,
        sampleAcquireASPNETRegistration,
        sampleAcquireStatusRegistration,
        sampleDotnetUninstallAllRegistration,
        sampleConcurrentTest,
        sampleConcurrentASPNETTest,
        sampleShowAcquisitionLogRegistration,
        sampleFindPathRegistration,
    );

    // --------------------------------------------------------------------------

    // ---------------------sdk extension registrations--------------------------

    const sampleSDKAcquireRegistration = vscode.commands.registerCommand('sample.dotnet-sdk.acquire', async (version) =>
    {
        if (!version)
        {
            version = await vscode.window.showInputBox({
                placeHolder: '5.0',
                value: '5.0',
                prompt: '.NET SDK version, i.e. 5.0',
            });
        }

        try
        {
            await vscode.commands.executeCommand('dotnet-sdk.showAcquisitionLog');
            await vscode.commands.executeCommand('dotnet-sdk.acquire', { version, requestingExtensionId });
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKGlobalAcquireRegistration = vscode.commands.registerCommand('sample.dotnet-sdk.acquireGlobal', async (version) =>
    {
        if (!version)
        {
            version = await vscode.window.showInputBox({
                placeHolder: '7.0.103',
                value: '7.0.103',
                prompt: 'The .NET SDK version. You can use different formats: 5, 3.1, 7.0.3xx, 6.0.201, etc.',
            });
        }

        try
        {
            await vscode.commands.executeCommand('dotnet-sdk.showAcquisitionLog');
            let commandContext: IDotnetAcquireContext = { version: version, requestingExtensionId: requestingExtensionId, installType: 'global' };
            await vscode.commands.executeCommand('dotnet-sdk.acquire', commandContext);
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKAcquireStatusRegistration = vscode.commands.registerCommand('sample.dotnet-sdk.acquireStatus', async (version) =>
    {
        if (!version)
        {
            version = await vscode.window.showInputBox({
                placeHolder: '5.0',
                value: '5.0',
                prompt: '.NET SDK version, i.e. 5.0',
            });
        }

        try
        {
            await vscode.commands.executeCommand('dotnet-sdk.showAcquisitionLog');
            const status = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquireStatus', { version, requestingExtensionId });
            vscode.window.showInformationMessage(status === undefined ? '.NET is not installed' : `.NET version ${version} installed at ${status.dotnetPath}`);
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKlistVersions = vscode.commands.registerCommand('sample.dotnet-sdk.listVersions', async (getRuntimes: boolean) =>
    {
        if (!getRuntimes)
        {
            getRuntimes = JSON.parse(await vscode.window.showInputBox({
                placeHolder: 'false',
                value: 'false',
                prompt: 'Acquire Runtimes? Use `true` if so, else, give `false`.',
            }) ?? 'false');
        }

        try
        {
            const result: IDotnetListVersionsResult | undefined = await vscode.commands.executeCommand('dotnet-sdk.listVersions', { listRuntimes: getRuntimes });
            vscode.window.showInformationMessage(`Available ${getRuntimes == false ? 'SDKS' : 'Runtimes'}: ${result?.map((x: any) => x.version).join(", ")}`);
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKrecommendedVersion = vscode.commands.registerCommand('sample.dotnet-sdk.recommendedVersion', async (getRuntimes: boolean) =>
    {
        try
        {
            const result: IDotnetListVersionsResult | undefined = await vscode.commands.executeCommand('dotnet.recommendedVersion', { listRuntimes: getRuntimes });
            vscode.window.showInformationMessage(`Recommended SDK Version to Install: ${result?.[0]?.version}`);
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKDotnetUninstallAllRegistration = vscode.commands.registerCommand('sample.dotnet-sdk.uninstallAll', async () =>
    {
        try
        {
            await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
            vscode.window.showInformationMessage('.NET SDKs uninstalled.');
        }
        catch (error)
        {
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const sampleSDKShowAcquisitionLogRegistration = vscode.commands.registerCommand('sample.dotnet-sdk.showAcquisitionLog', async () =>
    {
        try
        {
            await vscode.commands.executeCommand('dotnet-sdk.showAcquisitionLog');
        }
        catch (error)
        {
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
        sampleSDKShowAcquisitionLogRegistration,
        sampleGlobalSDKFromRuntimeRegistration);
}