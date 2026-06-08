/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import
{
    EventBasedError,
    MockEnvironmentVariableCollection,
    MockEventStream,
    MockExtensionConfiguration,
    MockExtensionContext,
    MockTelemetryReporter,
    MockWindowDisplayWorker
} from 'vscode-dotnet-runtime-library';
import * as extension from '../../extension';
import { computeLinuxPatchMismatchNote, highestPatchInSameFeatureBand, isFullySpecifiedSdkVersion, resolveSdkVersionForInstall, ToolNames } from '../../LanguageModelTools';

const assert: any = chai.assert;
const standardTimeoutTime = 30000;
const networkTimeoutTime = 60000; // Longer timeout for network-dependent tests

/**
 * Helper to extract text content from a LanguageModelToolResult
 */
function extractTextContent(result: vscode.LanguageModelToolResult): string
{
    return result.content
        .filter((part: any) => part instanceof vscode.LanguageModelTextPart)
        .map((part: any) => part.value)
        .join('');
}

/**
 * Mirrors normalizeArchitecture in LanguageModelTools.ts so the test can reason about the system architecture.
 */
function normalizeArchitecture(arch: string): string
{
    return arch === 'ia32' ? 'x86' : arch;
}

/**
 * Returns an architecture name guaranteed to differ from this machine's architecture,
 * so cross-architecture (non-native) scenarios can be exercised deterministically.
 */
function nonNativeArchitecture(): string
{
    return normalizeArchitecture(os.arch()) === 'arm64' ? 'x64' : 'arm64';
}

/**
 * Language Model Tools Tests
 *
 * NOTE FOR AI AGENTS: When iterating on Language Model Tools (LanguageModelTools.ts),
 * use `npm run test:lm-tools` for faster feedback (~30 seconds vs ~7 minutes for full suite).
 */
suite('LanguageModelTools Tests', function ()
{
    this.retries(1);

    const storagePath = path.join(__dirname, 'tmp-lm-tools');
    const mockState = new MockExtensionContext();
    const extensionPath = path.join(__dirname, '/../../..');
    const logPath = path.join(__dirname, 'logs');
    const mockDisplayWorker = new MockWindowDisplayWorker();
    let extensionContext: vscode.ExtensionContext;
    const environmentVariableCollection = new MockEnvironmentVariableCollection();

    this.beforeAll(async () =>
    {
        // Only activate if not already activated by prior test suites.
        // Check if the extension's commands are already registered to avoid double activation.
        const commands = await vscode.commands.getCommands(true);
        const alreadyActivated = commands.includes('dotnet.acquire');

        if (alreadyActivated)
        {
            // Extension was already activated by prior tests (e.g., DotnetCoreAcquisitionExtension.test.ts)
            // The Language Model Tools should already be registered, so we just need a mock context for cleanup.
            extensionContext = {
                subscriptions: [],
                globalStoragePath: storagePath,
                globalState: mockState,
                extensionPath,
                logPath,
                environmentVariableCollection
            } as any;
            return;
        }

        // Running in isolation (e.g., `npm run test:lm-tools`) - need to activate the extension
        extensionContext = {
            subscriptions: [],
            globalStoragePath: storagePath,
            globalState: mockState,
            extensionPath,
            logPath,
            environmentVariableCollection
        } as any;

        process.env.DOTNET_INSTALL_TOOL_UNDER_TEST = 'true';
        extension.ReEnableActivationForManualActivation();
        extension.activate(extensionContext, {
            telemetryReporter: new MockTelemetryReporter(),
            extensionConfiguration: new MockExtensionConfiguration([], true, ''),
            displayWorker: mockDisplayWorker,
        });
    });

    suite('Tool Registration', function ()
    {
        test('All eight Language Model Tools are registered after activation', async () =>
        {
            const tools = vscode.lm.tools;

            // Check that our tools are registered
            const toolNames = [
                ToolNames.installSdk,
                ToolNames.listVersions,
                ToolNames.recommendedSdkVersion,
                ToolNames.listInstalledVersions,
                ToolNames.findPath,
                ToolNames.uninstallSystemSdk,
                ToolNames.uninstallVSCodeRuntime,
                ToolNames.getSettingsInfo
            ];

            for (const toolName of toolNames)
            {
                const tool = tools.find((t: vscode.LanguageModelToolInformation) => t.name === toolName);
                assert.exists(tool, `Tool ${toolName} should be registered`);
            }

            // Verify we have exactly 8 tools matching our tool names
            const expectedNames = [
                ToolNames.installSdk,
                ToolNames.listVersions,
                ToolNames.recommendedSdkVersion,
                ToolNames.listInstalledVersions,
                ToolNames.findPath,
                ToolNames.uninstallSystemSdk,
                ToolNames.uninstallVSCodeRuntime,
                ToolNames.getSettingsInfo
            ];
            const ourTools = tools.filter(t => expectedNames.some(name => t.name.endsWith(name)));
            assert.equal(ourTools.length, 8, 'Should have exactly 8 .NET Install Tool tools registered');
        }).timeout(standardTimeoutTime);

        test('Tool names match package.json definitions', async () =>
        {
            assert.equal(ToolNames.installSdk, 'install_dotnet_sdk');
            assert.equal(ToolNames.listVersions, 'list_available_dotnet_versions_to_install');
            assert.equal(ToolNames.recommendedSdkVersion, 'recommended_dotnet_sdk_version');
            assert.equal(ToolNames.listInstalledVersions, 'list_installed_dotnet_versions');
            assert.equal(ToolNames.findPath, 'find_dotnet_executable_path');
            assert.equal(ToolNames.uninstallSystemSdk, 'uninstall_system_dotnet_sdk');
            assert.equal(ToolNames.uninstallVSCodeRuntime, 'uninstall_vscode_owned_dotnet_runtime');
            assert.equal(ToolNames.getSettingsInfo, 'get_settings_info_for_dotnet_installation_management');
        }).timeout(standardTimeoutTime);

        test('Tool names follow expected naming convention', async () =>
        {
            const expectedNames = [
                ToolNames.installSdk,
                ToolNames.listVersions,
                ToolNames.recommendedSdkVersion,
                ToolNames.listInstalledVersions,
                ToolNames.findPath,
                ToolNames.uninstallSystemSdk,
                ToolNames.uninstallVSCodeRuntime,
                ToolNames.getSettingsInfo
            ];
            const tools = vscode.lm.tools.filter(t => expectedNames.some(name => t.name.endsWith(name)));

            for (const tool of tools)
            {
                // Name should contain an underscore-separated identifier
                assert.match(tool.name, /_[a-z_]+$/, `Tool name ${tool.name} should follow naming convention`);
            }
        }).timeout(standardTimeoutTime);
    });

    suite('Tool Metadata', function ()
    {
        test('All registered tools have meaningful descriptions', async () =>
        {
            const tools = vscode.lm.tools;

            for (const tool of tools)
            {
                const expectedNames = [
                    ToolNames.installSdk,
                    ToolNames.listVersions,
                    ToolNames.recommendedSdkVersion,
                    ToolNames.listInstalledVersions,
                    ToolNames.findPath,
                    ToolNames.uninstallSystemSdk,
                    ToolNames.uninstallVSCodeRuntime,
                    ToolNames.getSettingsInfo
                ];
                if (expectedNames.some(name => tool.name.endsWith(name)))
                {
                    assert.exists(tool.description, `Tool ${tool.name} should have a description`);
                    assert.isString(tool.description, `Tool ${tool.name} description should be a string`);
                    assert.isAbove(tool.description.length, 20, `Tool ${tool.name} description should be meaningful (at least 20 chars)`);
                }
            }
        }).timeout(standardTimeoutTime);

        test('Tools have display names accessible via vscode.lm.tools', async () =>
        {
            const tools = vscode.lm.tools;
            const expectedNames = [
                ToolNames.installSdk,
                ToolNames.listVersions,
                ToolNames.recommendedSdkVersion,
                ToolNames.listInstalledVersions,
                ToolNames.findPath,
                ToolNames.uninstallSystemSdk,
                ToolNames.uninstallVSCodeRuntime,
                ToolNames.getSettingsInfo
            ];
            const ourTools = tools.filter(t => expectedNames.some(name => t.name.endsWith(name)));

            // All our tools should be retrievable
            assert.isAbove(ourTools.length, 0, 'Should find our tools in vscode.lm.tools');
        }).timeout(standardTimeoutTime);
    });

    suite('GetSettingsInfo Tool', function ()
    {
        test('Returns comprehensive guide content', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.getSettingsInfo,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');
            assert.isArray(result.content, 'Content should be an array');
            assert.isAbove(result.content.length, 0, 'Content should not be empty');

            const textContent = extractTextContent(result);

            // Verify key sections are present
            assert.include(textContent, 'existingDotnetPath', 'Content should explain existingDotnetPath setting');
            assert.include(textContent, 'LOCAL', 'Content should explain local installs');
            assert.include(textContent, 'GLOBAL', 'Content should explain global installs');
            assert.include(textContent, 'PATH', 'Content should mention PATH');
        }).timeout(standardTimeoutTime);

        test('Explains installation types (local vs global)', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.getSettingsInfo,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should explain the difference between local and global installs
            assert.include(textContent, 'Extension-Managed', 'Should explain extension-managed installs');
            assert.include(textContent, 'system-wide', 'Should explain system-wide installs');
            assert.include(textContent, 'Program Files', 'Should mention Program Files for Windows');
        }).timeout(standardTimeoutTime);

        test('Explains global.json handling', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.getSettingsInfo,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should explain global.json
            assert.include(textContent, 'global.json', 'Should mention global.json');
            assert.include(textContent, 'sdk', 'Should mention SDK context');
        }).timeout(standardTimeoutTime);

        test('Includes current settings values', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.getSettingsInfo,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should include a section about current settings
            assert.include(textContent, 'Current Settings', 'Should have current settings section');
        }).timeout(standardTimeoutTime);

        test('Explains SDK vs Runtime versioning', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.getSettingsInfo,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should explain SDK/Runtime relationship
            assert.include(textContent, 'SDK', 'Should mention SDK');
            assert.include(textContent, 'Runtime', 'Should mention Runtime');
        }).timeout(standardTimeoutTime);
    });

    suite('ListVersions Tool', function ()
    {
        test('Returns SDK versions when listRuntimes is false', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.listVersions,
                { input: { listRuntimes: false }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');
            assert.isArray(result.content, 'Content should be an array');
            assert.isAbove(result.content.length, 0, 'Content should not be empty');

            const textContent = extractTextContent(result);

            // Should contain SDK version information or an error message
            const hasVersionInfo = textContent.includes('SDK') || textContent.includes('version') || textContent.includes('network');
            assert.isTrue(hasVersionInfo, 'Content should contain version information or network error');
        }).timeout(networkTimeoutTime);

        test('Returns Runtime versions when listRuntimes is true', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.listVersions,
                { input: { listRuntimes: true }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');

            const textContent = extractTextContent(result);

            // Should contain Runtime version information or an error message
            const hasVersionInfo = textContent.includes('Runtime') || textContent.includes('version') || textContent.includes('network');
            assert.isTrue(hasVersionInfo, 'Content should contain version information or network error');
        }).timeout(networkTimeoutTime);

        test('Defaults to SDK versions when no input provided', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.listVersions,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');
        }).timeout(networkTimeoutTime);

        test('Groups versions by support phase when available', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.listVersions,
                { input: { listRuntimes: false }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // If we got versions (not a network error), should have support phase grouping
            if (textContent.includes('Available'))
            {
                // Should group by support phase (Active, Maintenance, EOL)
                const hasGrouping = textContent.includes('Active') ||
                    textContent.includes('Maintenance') ||
                    textContent.includes('Recommended');
                assert.isTrue(hasGrouping, 'Should group versions by support phase or have recommendation');
            }
        }).timeout(networkTimeoutTime);
    });

    suite('FindPath Tool', function ()
    {
        test('Requires version parameter', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.findPath,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should indicate version is required
            assert.include(textContent.toLowerCase(), 'version', 'Should mention version requirement');
        }).timeout(standardTimeoutTime);

        test('Searches for .NET with valid version input', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.findPath,
                { input: { version: '8.0' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');

            const textContent = extractTextContent(result);

            // Should either find .NET or report not found
            const hasResult = textContent.includes('Found') ||
                textContent.includes('Not Found') ||
                textContent.includes('Path') ||
                textContent.includes('not found') ||
                textContent.includes('resolve');
            assert.isTrue(hasResult, 'Should report whether .NET was found or not');
        }).timeout(standardTimeoutTime);

        test('Accepts mode parameter (sdk vs runtime)', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.findPath,
                { input: { version: '8.0', mode: 'sdk' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');

            const textContent = extractTextContent(result);

            // Should mention SDK in response
            const mentionsSdk = textContent.includes('SDK') || textContent.includes('sdk');
            assert.isTrue(mentionsSdk, 'Response should reference SDK mode');
        }).timeout(standardTimeoutTime);

        test('Accepts architecture parameter', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.findPath,
                { input: { version: '8.0', architecture: 'x64' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');

            const textContent = extractTextContent(result);

            // Should mention architecture in response
            assert.include(textContent, 'x64', 'Response should mention the architecture');
        }).timeout(standardTimeoutTime);

        test('Explains search locations when .NET not found', async () =>
        {
            // Use a version that likely doesn't exist
            const result = await vscode.lm.invokeTool(
                ToolNames.findPath,
                { input: { version: '99.0' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should explain where we searched
            if (textContent.includes('Not Found') || textContent.includes('not found'))
            {
                const explainedLocations = textContent.includes('PATH') ||
                    textContent.includes('DOTNET_ROOT') ||
                    textContent.includes('existingDotnetPath');
                assert.isTrue(explainedLocations, 'Should explain search locations when not found');
            }
        }).timeout(standardTimeoutTime);
    });

    suite('ListInstalledVersions Tool', function ()
    {
        test('Can be invoked without parameters (uses PATH)', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.listInstalledVersions,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');

            const textContent = extractTextContent(result);

            // Should either list versions or explain none found
            const hasResult = textContent.includes('Installed') ||
                textContent.includes('found') ||
                textContent.includes('SDK') ||
                textContent.includes('No .NET');
            assert.isTrue(hasResult, 'Should report installed versions or indicate none found');
        }).timeout(standardTimeoutTime);

        test('Accepts optional dotnetPath parameter', async () =>
        {
            // Provide a path (may or may not exist)
            const result = await vscode.lm.invokeTool(
                ToolNames.listInstalledVersions,
                { input: { dotnetPath: 'C:\\Program Files\\dotnet\\dotnet.exe' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');
        }).timeout(standardTimeoutTime);

        test('Accepts mode parameter (sdk vs runtime)', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.listInstalledVersions,
                { input: { mode: 'runtime' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');

            const textContent = extractTextContent(result);

            // Should mention Runtime in response
            const mentionsRuntime = textContent.includes('Runtime') || textContent.includes('runtime');
            assert.isTrue(mentionsRuntime, 'Response should reference runtime mode');
        }).timeout(standardTimeoutTime);

        test('Returns table format with version details', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.listInstalledVersions,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // If versions are found, should have table format
            if (textContent.includes('|') && textContent.includes('Version'))
            {
                // SDKs table has Architecture column; Runtimes are grouped by mode
                assert.include(textContent, 'Architecture', 'Table should include Architecture column');
            }
        }).timeout(standardTimeoutTime);
    });

    suite('Uninstall Tools', function ()
    {
        test('System SDK tool accepts version parameter', async () =>
        {
            // This won't actually uninstall anything, but should accept the parameter
            const result = await vscode.lm.invokeTool(
                ToolNames.uninstallSystemSdk,
                { input: { version: '6.0.0' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');
        }).timeout(standardTimeoutTime);

        test('VS Code runtime tool accepts version parameter', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.uninstallVSCodeRuntime,
                { input: { version: '6.0.0' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');
        }).timeout(standardTimeoutTime);

        test('VS Code runtime tool accepts mode parameter', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.uninstallVSCodeRuntime,
                { input: { version: '6.0.0', mode: 'aspnetcore' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
        }).timeout(standardTimeoutTime);

        test('System SDK tool accepts architecture parameter', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.uninstallSystemSdk,
                { input: { version: '6.0.0', architecture: normalizeArchitecture(os.arch()) }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
        }).timeout(standardTimeoutTime);
    });

    suite('InstallSdk Tool (Validation Only)', function ()
    {
        // Note: We don't actually install in tests to avoid side effects
        // These tests validate the tool accepts parameters correctly

        test('Tool is registered and can be found', async () =>
        {
            const tools = vscode.lm.tools;
            const installTool = tools.find((t: vscode.LanguageModelToolInformation) => t.name === ToolNames.installSdk);

            assert.exists(installTool, 'Install SDK tool should be registered');
            assert.exists(installTool?.description, 'Install SDK tool should have a description');
        }).timeout(standardTimeoutTime);

        test('Tool description mentions global/system-wide installation', async () =>
        {
            const tools = vscode.lm.tools;
            const installTool = tools.find((t: vscode.LanguageModelToolInformation) => t.name === ToolNames.installSdk);

            const description = installTool?.description?.toLowerCase() || '';
            const mentionsGlobal = description.includes('global') || description.includes('system');
            assert.isTrue(mentionsGlobal, 'Description should mention global/system-wide installation');
        }).timeout(standardTimeoutTime);
    });

    suite('Cross-Architecture Handling', function ()
    {
        test('InstallSdk tool with a non-native architecture provides instructions to install another way', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.installSdk,
                { input: { version: '8.0', architecture: nonNativeArchitecture() }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            const textContent = extractTextContent(result);

            // The requested (non-native) architecture should be named back to the model.
            assert.include(textContent, nonNativeArchitecture(), 'Should mention the requested architecture');
            // It should make clear cross-architecture installs are unsupported.
            assert.include(textContent, 'does not match this machine', 'Should explain the architecture mismatch');
            assert.include(textContent.toLowerCase(), 'cross-architecture', 'Should mention cross-architecture is unsupported');
        }).timeout(standardTimeoutTime);

        test('System SDK uninstall tool with a non-native architecture provides instructions to uninstall another way', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.uninstallSystemSdk,
                { input: { version: '8.0.0', architecture: nonNativeArchitecture() }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            const textContent = extractTextContent(result);

            assert.include(textContent, nonNativeArchitecture(), 'Should mention the requested architecture');
            assert.include(textContent, 'does not match this machine', 'Should explain the architecture mismatch');
            assert.include(textContent.toLowerCase(), 'cross-architecture', 'Should mention cross-architecture is unsupported');
            assert.include(textContent, 'Find your own way to uninstall', 'Should instruct the model to find another uninstall method');
        }).timeout(standardTimeoutTime);

        test('InstallSdk tool with the native architecture does not return the cross-architecture message', async () =>
        {
            const nativeArch = normalizeArchitecture(os.arch());
            // Use a malformed version with the native architecture: the cross-architecture guard runs first and
            // (for a native arch) passes through, then version resolution rejects 'foo' synchronously (no network,
            // no installer, no elevation prompt) and the tool returns a normal failure result.
            const result = await vscode.lm.invokeTool(
                ToolNames.installSdk,
                { input: { version: 'foo', architecture: nativeArch }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            const textContent = extractTextContent(result);

            // Native architecture must not be short-circuited by the cross-architecture guard.
            assert.notInclude(textContent, 'cross-architecture',
                'Native architecture should not trigger the cross-architecture message');
        }).timeout(standardTimeoutTime);
    });

    suite('Tool Error Handling', function ()
    {
        test('FindPath handles missing version gracefully', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.findPath,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should not throw, should return helpful message
            assert.include(textContent.toLowerCase(), 'version', 'Should mention version is needed');
        }).timeout(standardTimeoutTime);

        test('FindPath handles non-existent version gracefully', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.findPath,
                { input: { version: '999.999' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should return not found, not throw
            assert.exists(result, 'Should return a result, not throw');
            const hasNotFoundMsg = textContent.includes('Not Found') ||
                textContent.includes('not found') ||
                textContent.includes('No .NET');
            assert.isTrue(hasNotFoundMsg, 'Should indicate version was not found');
        }).timeout(standardTimeoutTime);

        test('ListInstalledVersions handles invalid path gracefully', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.listInstalledVersions,
                { input: { dotnetPath: '/nonexistent/path/dotnet' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Should return a result, not throw');
        }).timeout(standardTimeoutTime);

        test('All tools return LanguageModelToolResult with content array', async () =>
        {
            const toolsToTest = [
                { name: ToolNames.getSettingsInfo, input: {} },
                { name: ToolNames.findPath, input: { version: '8.0' } },
                { name: ToolNames.listInstalledVersions, input: {} },
                { name: ToolNames.uninstallSystemSdk, input: {} },
                { name: ToolNames.uninstallVSCodeRuntime, input: {} }
            ];

            for (const toolTest of toolsToTest)
            {
                const result = await vscode.lm.invokeTool(
                    toolTest.name,
                    { input: toolTest.input, toolInvocationToken: undefined },
                    new vscode.CancellationTokenSource().token
                );

                assert.exists(result, `${toolTest.name} should return a result`);
                assert.exists(result.content, `${toolTest.name} result should have content`);
                assert.isArray(result.content, `${toolTest.name} content should be an array`);
            }
        }).timeout(networkTimeoutTime);
    });

    suite('Cancellation Token Support', function ()
    {
        test('Tools accept cancellation token without error', async () =>
        {
            const cts = new vscode.CancellationTokenSource();

            // Don't cancel, just verify token is accepted
            const result = await vscode.lm.invokeTool(
                ToolNames.getSettingsInfo,
                { input: {}, toolInvocationToken: undefined },
                cts.token
            );

            assert.exists(result, 'Tool should complete with cancellation token');
            cts.dispose();
        }).timeout(standardTimeoutTime);
    });

    suite('Error Propagation to LLM', function ()
    {
        /**
         * These tests verify that errors are properly surfaced to the LLM
         * so it has context about what went wrong (e.g., user cancelled, installation failed).
         */

        test('InstallSdk tool returns ERROR message when installation fails or returns undefined', async () =>
        {
            // We can't easily simulate a failed global SDK install without admin privileges, but a malformed version
            // is rejected synchronously by version resolution (no network / installer / elevation) and surfaces a failure.
            const result = await vscode.lm.invokeTool(
                ToolNames.installSdk,
                { input: { version: 'foo' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // A failed install should clearly indicate failure so the LLM can act on it.
            assert.include(textContent.toLowerCase(), 'failed', 'Should indicate the install failed');
        }).timeout(standardTimeoutTime);

        test('InstallSdk tool context includes rethrowError property', async () =>
        {
            // Verify the context object is built correctly by checking the source code behavior
            // The actual rethrowError test is in ErrorHandler.test.ts
            // Here we verify the tool configuration is correct

            // This test validates that when an error occurs, the tool's catch block
            // will receive the actual error message (verified by the unit tests in ErrorHandler.test.ts)

            const tools = vscode.lm.tools;
            const installTool = tools.find(t => t.name === ToolNames.installSdk);

            assert.exists(installTool, 'Install SDK tool should be registered');
            // The actual rethrowError behavior is tested via ErrorHandler.test.ts
            // This integration test just confirms the tool is properly configured
        }).timeout(standardTimeoutTime);

        test('Uninstall tool surfaces errors when operation fails', async () =>
        {
            // Try to uninstall a non-existent system SDK version
            const result = await vscode.lm.invokeTool(
                ToolNames.uninstallSystemSdk,
                { input: { version: '1.0.0' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should either fail gracefully or provide an informative message
            // The key is that it returns something informative, not just "undefined" or silence
            assert.exists(result, 'Should return a result even on failure');
            assert.isAbove(textContent.length, 0, 'Should provide informative feedback');
        }).timeout(standardTimeoutTime);

        test('Error messages contain actionable information for LLM', async () =>
        {
            // Test that error responses contain enough context for the LLM to help the user.
            // A malformed version fails synchronously (no network / installer / elevation).
            const result = await vscode.lm.invokeTool(
                ToolNames.installSdk,
                { input: { version: 'foo' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // The failure message should point the model at a concrete next step (manual install docs).
            const hasActionableGuidance = textContent.includes('manual install') ||
                textContent.includes('https://learn.microsoft.com/dotnet/core/install') ||
                textContent.includes('output channel');

            assert.isTrue(hasActionableGuidance, 'Error messages should provide actionable guidance');
        }).timeout(standardTimeoutTime);
    });

    suite('Enable/Disable Setting', function ()
    {
        test('enableLanguageModelTools setting exists and defaults to true', async () =>
        {
            const config = vscode.workspace.getConfiguration('dotnetAcquisitionExtension');
            const value = config.get<boolean>('enableLanguageModelTools');
            // The default in package.json is true, so unless explicitly overridden it should be true
            assert.isTrue(value, 'enableLanguageModelTools should default to true');
        }).timeout(standardTimeoutTime);

        test('Tools are registered when enableLanguageModelTools is true (default)', async () =>
        {
            // Since the extension activated with the default (true), all tools should be present
            const expectedNames = [
                ToolNames.installSdk,
                ToolNames.listVersions,
                ToolNames.recommendedSdkVersion,
                ToolNames.listInstalledVersions,
                ToolNames.findPath,
                ToolNames.uninstallSystemSdk,
                ToolNames.uninstallVSCodeRuntime,
                ToolNames.getSettingsInfo
            ];
            const tools = vscode.lm.tools;
            for (const name of expectedNames)
            {
                const tool = tools.find((t: vscode.LanguageModelToolInformation) => t.name === name);
                assert.exists(tool, `Tool ${name} should be registered when setting is true`);
            }
        }).timeout(standardTimeoutTime);

        test('Tools are visible when enableLanguageModelTools setting is true (default)', async () =>
        {
            // With the config.* when clause, VS Code reads the setting directly.
            // Since the default is true, tools should be visible and registered.
            const tool = vscode.lm.tools.find((t: vscode.LanguageModelToolInformation) => t.name === ToolNames.installSdk);
            assert.exists(tool, 'Tools should be available when setting is true');
        }).timeout(standardTimeoutTime);

        test('package.json tools all have when clause for enableLanguageModelTools', async () =>
        {
            // Read the package.json to verify all tools have the when clause.
            // This is a structural test to prevent regressions - if someone adds a new tool
            // without a when clause, the disable setting won't fully work.
            const fs = await import('fs');
            const packageJsonPath = path.join(extensionPath, 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const tools = packageJson?.contributes?.languageModelTools;
            assert.isArray(tools, 'package.json should have languageModelTools');
            assert.isAbove(tools.length, 0, 'Should have at least one tool defined');

            for (const tool of tools)
            {
                assert.property(tool, 'when', `Tool "${tool.name}" should have a "when" clause`);
                assert.include(
                    tool.when,
                    'config.dotnetAcquisitionExtension.enableLanguageModelTools',
                    `Tool "${tool.name}" when clause should reference config.dotnetAcquisitionExtension.enableLanguageModelTools`
                );
            }
        }).timeout(standardTimeoutTime);
    });

    suite('RecommendedSdkVersion Tool', function ()
    {
        test('Tool is registered with expected name', async () =>
        {
            const tool = vscode.lm.tools.find(t => t.name === ToolNames.recommendedSdkVersion);
            assert.exists(tool, 'recommended_dotnet_sdk_version tool should be registered');
            assert.isAbove((tool?.description ?? '').length, 20, 'Tool should have a meaningful description');
        }).timeout(standardTimeoutTime);

        test('Returns informative content on invocation', async () =>
        {
            const result = await vscode.lm.invokeTool(
                ToolNames.recommendedSdkVersion,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.isArray(result.content, 'Result content should be an array');

            const textContent = extractTextContent(result);
            assert.isAbove(textContent.length, 0, 'Should return non-empty text');

            // Either a version was determined, or a clear fallback was returned.
            const hasUsefulOutput =
                textContent.includes('Recommended .NET SDK version') ||
                textContent.includes('could not be determined') ||
                textContent.includes('Failed to determine');
            assert.isTrue(hasUsefulOutput,
                'Output must either surface a recommended version or an explicit fallback message');
        }).timeout(networkTimeoutTime);

        test('On Linux, surfaces distro-packaging note when a version is returned', async () =>
        {
            if (process.platform !== 'linux')
            {
                // Note is only emitted on Linux; nothing meaningful to assert on Windows/macOS.
                return;
            }

            const result = await vscode.lm.invokeTool(
                ToolNames.recommendedSdkVersion,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);
            if (textContent.includes('Recommended .NET SDK version'))
            {
                assert.include(textContent.toLowerCase(), 'distro',
                    'On Linux the recommended-version output must explain the distro-packaging caveat');
            }
        }).timeout(networkTimeoutTime);
    });

    suite('UnsupportedDistro Error Discriminator (contract)', function ()
    {
        /**
         * The InstallSdk tool maps `EventBasedError` instances whose `eventType === 'UnsupportedDistro'`
         * to the manual-install fallback. This requires:
         *   1. EventBasedError to be exported from the library entrypoint, and
         *   2. `instanceof EventBasedError` to work across the library/extension boundary, and
         *   3. `eventType` to be a readable public field on the thrown object.
         * If any of these regress, the tool would silently fall back to the generic error path
         * and re-introduce the bug where the LLM keeps retrying unsupported feature bands on Linux.
         */
        test('EventBasedError exposes eventType and survives instanceof checks', () =>
        {
            const err = new EventBasedError('UnsupportedDistro',
                'The distro Ubuntu 26.04 does not officially support dotnet version 10.0.300.');

            assert.instanceOf(err, Error, 'EventBasedError must be an Error subclass');
            assert.instanceOf(err, EventBasedError, 'instanceof EventBasedError must hold');
            assert.equal(err.eventType, 'UnsupportedDistro',
                'eventType must be readable for the InstallSdk tool to map to the manual-install fallback');
        }).timeout(standardTimeoutTime);
    });

    suite('Linux Patch Mismatch Detection', function ()
    {
        // These tests exercise the pure logic extracted from the InstallSdk success path so the
        // "requested patch not available, a newer patch was installed" conditional can be verified
        // without performing a real install. A MockEventStream satisfies the version-parsing helpers.
        const eventStream = new MockEventStream();

        suite('isFullySpecifiedSdkVersion', function ()
        {
            test('Treats a fully-specified patch as fully specified', () =>
            {
                assert.isTrue(isFullySpecifiedSdkVersion('10.0.106', eventStream));
            }).timeout(standardTimeoutTime);

            test('Treats partial versions, feature bands, and undefined as not fully specified', () =>
            {
                assert.isFalse(isFullySpecifiedSdkVersion('10', eventStream), 'major only');
                assert.isFalse(isFullySpecifiedSdkVersion('10.0', eventStream), 'major.minor only');
                assert.isFalse(isFullySpecifiedSdkVersion('10.0.1xx', eventStream), 'feature band');
                assert.isFalse(isFullySpecifiedSdkVersion(undefined, eventStream), 'undefined');
            }).timeout(standardTimeoutTime);
        });

        suite('highestPatchInSameFeatureBand', function ()
        {
            test('Picks the highest patch within the requested major.minor and feature band', () =>
            {
                const installed = ['10.0.106', '10.0.107', '10.0.108'];
                assert.equal(highestPatchInSameFeatureBand('10.0.106', installed, eventStream), '10.0.108');
            }).timeout(standardTimeoutTime);

            test('Ignores installs in a different feature band', () =>
            {
                // 10.0.2xx is a different feature band than the requested 10.0.1xx and must not be chosen.
                const installed = ['10.0.205', '10.0.108'];
                assert.equal(highestPatchInSameFeatureBand('10.0.106', installed, eventStream), '10.0.108');
            }).timeout(standardTimeoutTime);

            test('Ignores installs of a different major.minor', () =>
            {
                const installed = ['9.0.108', '8.0.412'];
                assert.isUndefined(highestPatchInSameFeatureBand('10.0.106', installed, eventStream));
            }).timeout(standardTimeoutTime);

            test('Returns undefined when no install matches the band', () =>
            {
                assert.isUndefined(highestPatchInSameFeatureBand('10.0.106', [], eventStream));
            }).timeout(standardTimeoutTime);
        });

        suite('resolveSdkVersionForInstall', function ()
        {
            test('Converts a bare major version to the .1xx feature band on Linux', () =>
            {
                assert.equal(resolveSdkVersionForInstall('6', 'linux', eventStream), '6.0.1xx');
            }).timeout(standardTimeoutTime);

            test('Converts a major.minor version to the .1xx feature band on Linux', () =>
            {
                assert.equal(resolveSdkVersionForInstall('6.0', 'linux', eventStream), '6.0.1xx');
            }).timeout(standardTimeoutTime);

            test('Leaves a bare major / major.minor version unchanged on Windows and macOS', () =>
            {
                assert.equal(resolveSdkVersionForInstall('6', 'win32', eventStream), '6', 'major on Windows');
                assert.equal(resolveSdkVersionForInstall('6.0', 'win32', eventStream), '6.0', 'major.minor on Windows');
                assert.equal(resolveSdkVersionForInstall('6', 'darwin', eventStream), '6', 'major on macOS');
                assert.equal(resolveSdkVersionForInstall('6.0', 'darwin', eventStream), '6.0', 'major.minor on macOS');
            }).timeout(standardTimeoutTime);

            test('Leaves an already-specific version unchanged on every platform', () =>
            {
                // A fully-specified patch and an explicit feature band are already package-manager-installable.
                assert.equal(resolveSdkVersionForInstall('6.0.301', 'linux', eventStream), '6.0.301', 'patch on Linux');
                assert.equal(resolveSdkVersionForInstall('6.0.1xx', 'linux', eventStream), '6.0.1xx', 'feature band on Linux');
                assert.equal(resolveSdkVersionForInstall('6.0.301', 'win32', eventStream), '6.0.301', 'patch on Windows');
            }).timeout(standardTimeoutTime);
        });

        suite('computeLinuxPatchMismatchNote', function ()
        {
            test('Emits a note naming the substituted patch when a newer patch was installed on Linux', () =>
            {
                const note = computeLinuxPatchMismatchNote('linux', '10.0.106', ['10.0.108'], eventStream);
                assert.include(note, '10.0.106', 'note should name the requested patch');
                assert.include(note, '10.0.108', 'note should name the patch actually installed');
                assert.include(note, 'not available', 'note should explain the requested patch was unavailable');
            }).timeout(standardTimeoutTime);

            test('Emits no note when the exact requested patch is present', () =>
            {
                const note = computeLinuxPatchMismatchNote('linux', '10.0.106', ['10.0.106', '10.0.108'], eventStream);
                assert.equal(note, '', 'no mismatch when the requested patch is installed');
            }).timeout(standardTimeoutTime);

            test('Emits no note on non-Linux platforms', () =>
            {
                assert.equal(computeLinuxPatchMismatchNote('win32', '10.0.106', ['10.0.108'], eventStream), '');
                assert.equal(computeLinuxPatchMismatchNote('darwin', '10.0.106', ['10.0.108'], eventStream), '');
            }).timeout(standardTimeoutTime);

            test('Emits no note when the requested version is not fully specified', () =>
            {
                assert.equal(computeLinuxPatchMismatchNote('linux', '10.0', ['10.0.108'], eventStream), '', 'major.minor request');
                assert.equal(computeLinuxPatchMismatchNote('linux', '10.0.1xx', ['10.0.108'], eventStream), '', 'feature band request');
            }).timeout(standardTimeoutTime);

            test('Emits no note when the installed-versions query failed (undefined)', () =>
            {
                assert.equal(computeLinuxPatchMismatchNote('linux', '10.0.106', undefined, eventStream), '');
            }).timeout(standardTimeoutTime);

            test('Emits no note when only a different feature band is installed', () =>
            {
                // The requested 10.0.1xx band is absent; a 10.0.2xx install must not be reported as the substitute.
                assert.equal(computeLinuxPatchMismatchNote('linux', '10.0.106', ['10.0.205'], eventStream), '');
            }).timeout(standardTimeoutTime);
        });
    });
});
