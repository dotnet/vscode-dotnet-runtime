/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as vscode from 'vscode';
import * as path from 'path';
import {
    MockExtensionConfiguration,
    MockExtensionContext,
    MockTelemetryReporter,
    MockWindowDisplayWorker,
    MockEnvironmentVariableCollection
} from 'vscode-dotnet-runtime-library';
import * as extension from '../../extension';
import { ToolNames } from '../../LanguageModelTools';

const assert: any = chai.assert;
const standardTimeoutTime = 30000;
const networkTimeoutTime = 60000; // Longer timeout for network-dependent tests

/**
 * Helper to extract text content from a LanguageModelToolResult
 */
function extractTextContent(result: vscode.LanguageModelToolResult): string {
    return result.content
        .filter((part: any) => part instanceof vscode.LanguageModelTextPart)
        .map((part: any) => part.value)
        .join('');
}

/**
 * Language Model Tools Tests
 *
 * NOTE FOR AI AGENTS: When iterating on Language Model Tools (LanguageModelTools.ts),
 * use `npm run test:lm-tools` for faster feedback (~30 seconds vs ~7 minutes for full suite).
 */
suite('LanguageModelTools Tests', function () {
    this.retries(1);

    const storagePath = path.join(__dirname, 'tmp-lm-tools');
    const mockState = new MockExtensionContext();
    const extensionPath = path.join(__dirname, '/../../..');
    const logPath = path.join(__dirname, 'logs');
    const mockDisplayWorker = new MockWindowDisplayWorker();
    let extensionContext: vscode.ExtensionContext;
    const environmentVariableCollection = new MockEnvironmentVariableCollection();

    this.beforeAll(async () => {
        // Only activate if not already activated by prior test suites
        // This allows running LM tools tests in isolation with `npm run test:lm-tools`
        try {
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
        } catch (e) {
            // Extension may already be activated by prior tests - that's fine
            console.log('Extension already activated or activation failed (expected in full test suite):', e);
        }
    });

    suite('Tool Registration', function () {
        test('All six Language Model Tools are registered after activation', async () => {
            const tools = vscode.lm.tools;

            // Check that our tools are registered
            const toolNames = [
                ToolNames.installSdk,
                ToolNames.listVersions,
                ToolNames.listInstalledVersions,
                ToolNames.findPath,
                ToolNames.uninstall,
                ToolNames.getSettingsInfo
            ];

            for (const toolName of toolNames) {
                const tool = tools.find(t => t.name === toolName);
                assert.exists(tool, `Tool ${toolName} should be registered`);
            }

            // Verify we have exactly 6 tools with our prefix
            const ourTools = tools.filter(t => t.name.startsWith('dotnet-install-tool_'));
            assert.equal(ourTools.length, 6, 'Should have exactly 6 dotnet-install-tool tools registered');
        }).timeout(standardTimeoutTime);

        test('Tool names match package.json definitions', async () => {
            assert.equal(ToolNames.installSdk, 'dotnet-install-tool_installSdk');
            assert.equal(ToolNames.listVersions, 'dotnet-install-tool_listVersions');
            assert.equal(ToolNames.listInstalledVersions, 'dotnet-install-tool_listInstalledVersions');
            assert.equal(ToolNames.findPath, 'dotnet-install-tool_findPath');
            assert.equal(ToolNames.uninstall, 'dotnet-install-tool_uninstall');
            assert.equal(ToolNames.getSettingsInfo, 'dotnet-install-tool_getSettingsInfo');
        }).timeout(standardTimeoutTime);

        test('Tool names follow expected naming convention', async () => {
            const tools = vscode.lm.tools.filter(t => t.name.startsWith('dotnet-install-tool_'));

            for (const tool of tools) {
                // Name should be prefixed with extension identifier
                assert.match(tool.name, /^dotnet-install-tool_[a-zA-Z]+$/, `Tool name ${tool.name} should follow naming convention`);
            }
        }).timeout(standardTimeoutTime);
    });

    suite('Tool Metadata', function () {
        test('All registered tools have meaningful descriptions', async () => {
            const tools = vscode.lm.tools;

            for (const tool of tools) {
                if (tool.name.startsWith('dotnet-install-tool_')) {
                    assert.exists(tool.description, `Tool ${tool.name} should have a description`);
                    assert.isString(tool.description, `Tool ${tool.name} description should be a string`);
                    assert.isAbove(tool.description.length, 20, `Tool ${tool.name} description should be meaningful (at least 20 chars)`);
                }
            }
        }).timeout(standardTimeoutTime);

        test('Tools have display names accessible via vscode.lm.tools', async () => {
            const tools = vscode.lm.tools;
            const ourTools = tools.filter(t => t.name.startsWith('dotnet-install-tool_'));

            // All our tools should be retrievable
            assert.isAbove(ourTools.length, 0, 'Should find our tools in vscode.lm.tools');
        }).timeout(standardTimeoutTime);
    });

    suite('GetSettingsInfo Tool', function () {
        test('Returns comprehensive guide content', async () => {
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

        test('Explains installation types (local vs global)', async () => {
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

        test('Explains global.json handling', async () => {
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

        test('Includes current settings values', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.getSettingsInfo,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should include a section about current settings
            assert.include(textContent, 'Current Settings', 'Should have current settings section');
        }).timeout(standardTimeoutTime);

        test('Explains SDK vs Runtime versioning', async () => {
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

    suite('ListVersions Tool', function () {
        test('Returns SDK versions when listRuntimes is false', async () => {
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

        test('Returns Runtime versions when listRuntimes is true', async () => {
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

        test('Defaults to SDK versions when no input provided', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.listVersions,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');
        }).timeout(networkTimeoutTime);

        test('Groups versions by support phase when available', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.listVersions,
                { input: { listRuntimes: false }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // If we got versions (not a network error), should have support phase grouping
            if (textContent.includes('Available')) {
                // Should group by support phase (Active, Maintenance, EOL)
                const hasGrouping = textContent.includes('Active') ||
                                    textContent.includes('Maintenance') ||
                                    textContent.includes('Recommended');
                assert.isTrue(hasGrouping, 'Should group versions by support phase or have recommendation');
            }
        }).timeout(networkTimeoutTime);
    });

    suite('FindPath Tool', function () {
        test('Requires version parameter', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.findPath,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should indicate version is required
            assert.include(textContent.toLowerCase(), 'version', 'Should mention version requirement');
        }).timeout(standardTimeoutTime);

        test('Searches for .NET with valid version input', async () => {
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

        test('Accepts mode parameter (sdk vs runtime)', async () => {
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

        test('Accepts architecture parameter', async () => {
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

        test('Explains search locations when .NET not found', async () => {
            // Use a version that likely doesn't exist
            const result = await vscode.lm.invokeTool(
                ToolNames.findPath,
                { input: { version: '99.0' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should explain where we searched
            if (textContent.includes('Not Found') || textContent.includes('not found')) {
                const explainedLocations = textContent.includes('PATH') ||
                                           textContent.includes('DOTNET_ROOT') ||
                                           textContent.includes('existingDotnetPath');
                assert.isTrue(explainedLocations, 'Should explain search locations when not found');
            }
        }).timeout(standardTimeoutTime);
    });

    suite('ListInstalledVersions Tool', function () {
        test('Can be invoked without parameters (uses PATH)', async () => {
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

        test('Accepts optional dotnetPath parameter', async () => {
            // Provide a path (may or may not exist)
            const result = await vscode.lm.invokeTool(
                ToolNames.listInstalledVersions,
                { input: { dotnetPath: 'C:\\Program Files\\dotnet\\dotnet.exe' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');
        }).timeout(standardTimeoutTime);

        test('Accepts mode parameter (sdk vs runtime)', async () => {
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

        test('Returns table format with version details', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.listInstalledVersions,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // If versions are found, should have table format
            if (textContent.includes('|') && textContent.includes('Version')) {
                assert.include(textContent, 'Architecture', 'Table should include Architecture column');
                assert.include(textContent, 'Directory', 'Table should include Directory column');
            }
        }).timeout(standardTimeoutTime);
    });

    suite('Uninstall Tool', function () {
        test('Can be invoked without parameters (launches interactive picker)', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.uninstall,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');

            const textContent = extractTextContent(result);

            // Should mention interactive dialog or selection
            const mentionsInteractive = textContent.includes('interactive') ||
                                        textContent.includes('dialog') ||
                                        textContent.includes('select') ||
                                        textContent.includes('dropdown');
            assert.isTrue(mentionsInteractive, 'Should mention interactive uninstall when no version provided');
        }).timeout(standardTimeoutTime);

        test('Accepts version parameter', async () => {
            // This won't actually uninstall anything, but should accept the parameter
            const result = await vscode.lm.invokeTool(
                ToolNames.uninstall,
                { input: { version: '6.0.0' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');
        }).timeout(standardTimeoutTime);

        test('Accepts mode parameter', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.uninstall,
                { input: { version: '6.0.0', mode: 'sdk' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
        }).timeout(standardTimeoutTime);

        test('Accepts global parameter', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.uninstall,
                { input: { version: '6.0.0', global: true }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
        }).timeout(standardTimeoutTime);
    });

    suite('InstallSdk Tool (Validation Only)', function () {
        // Note: We don't actually install in tests to avoid side effects
        // These tests validate the tool accepts parameters correctly

        test('Tool is registered and can be found', async () => {
            const tools = vscode.lm.tools;
            const installTool = tools.find(t => t.name === ToolNames.installSdk);

            assert.exists(installTool, 'Install SDK tool should be registered');
            assert.exists(installTool?.description, 'Install SDK tool should have a description');
        }).timeout(standardTimeoutTime);

        test('Tool description mentions global/system-wide installation', async () => {
            const tools = vscode.lm.tools;
            const installTool = tools.find(t => t.name === ToolNames.installSdk);

            const description = installTool?.description?.toLowerCase() || '';
            const mentionsGlobal = description.includes('global') || description.includes('system');
            assert.isTrue(mentionsGlobal, 'Description should mention global/system-wide installation');
        }).timeout(standardTimeoutTime);
    });

    suite('Tool Error Handling', function () {
        test('FindPath handles missing version gracefully', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.findPath,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            const textContent = extractTextContent(result);

            // Should not throw, should return helpful message
            assert.include(textContent.toLowerCase(), 'version', 'Should mention version is needed');
        }).timeout(standardTimeoutTime);

        test('FindPath handles non-existent version gracefully', async () => {
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

        test('ListInstalledVersions handles invalid path gracefully', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.listInstalledVersions,
                { input: { dotnetPath: '/nonexistent/path/dotnet' }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Should return a result, not throw');
        }).timeout(standardTimeoutTime);

        test('All tools return LanguageModelToolResult with content array', async () => {
            const toolsToTest = [
                { name: ToolNames.getSettingsInfo, input: {} },
                { name: ToolNames.findPath, input: { version: '8.0' } },
                { name: ToolNames.listInstalledVersions, input: {} },
                { name: ToolNames.uninstall, input: {} }
            ];

            for (const toolTest of toolsToTest) {
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

    suite('Cancellation Token Support', function () {
        test('Tools accept cancellation token without error', async () => {
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
});
