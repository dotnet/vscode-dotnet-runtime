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
        test('Language Model Tools are registered after activation', async () => {
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
        }).timeout(standardTimeoutTime);

        test('Tool names match package.json definitions', async () => {
            assert.equal(ToolNames.installSdk, 'dotnet-install-tool_installSdk');
            assert.equal(ToolNames.listVersions, 'dotnet-install-tool_listVersions');
            assert.equal(ToolNames.listInstalledVersions, 'dotnet-install-tool_listInstalledVersions');
            assert.equal(ToolNames.findPath, 'dotnet-install-tool_findPath');
            assert.equal(ToolNames.uninstall, 'dotnet-install-tool_uninstall');
            assert.equal(ToolNames.getSettingsInfo, 'dotnet-install-tool_getSettingsInfo');
        }).timeout(standardTimeoutTime);
    });

    suite('Tool Information', function () {
        test('Registered tools have descriptions', async () => {
            const tools = vscode.lm.tools;

            for (const tool of tools) {
                if (tool.name.startsWith('dotnet-install-tool_')) {
                    assert.exists(tool.description, `Tool ${tool.name} should have a description`);
                    assert.isString(tool.description, `Tool ${tool.name} description should be a string`);
                    assert.isAbove(tool.description.length, 10, `Tool ${tool.name} description should be meaningful`);
                }
            }
        }).timeout(standardTimeoutTime);

        // Note: inputSchema tests are skipped because the schema is defined in package.json
        // and may not be exposed on the vscode.lm.tools array in all VS Code versions.
        // The schemas are validated at extension manifest level by VS Code.
    });

    suite('Tool Invocation via vscode.lm.invokeTool', function () {
        test('GetSettingsInfo tool can be invoked and returns content', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.getSettingsInfo,
                { input: {}, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');
            assert.isArray(result.content, 'Content should be an array');
            assert.isAbove(result.content.length, 0, 'Content should not be empty');

            // Check that the content includes key information
            const textContent = result.content
                .filter((part: any) => part instanceof vscode.LanguageModelTextPart)
                .map((part: any) => part.value)
                .join('');

            assert.include(textContent, 'existingDotnetPath', 'Content should explain existingDotnetPath setting');
            assert.include(textContent, 'LOCAL', 'Content should explain local installs');
            assert.include(textContent, 'GLOBAL', 'Content should explain global installs');
            assert.include(textContent, 'PATH', 'Content should mention PATH');
        }).timeout(standardTimeoutTime);

        test('ListVersions tool can be invoked', async () => {
            const result = await vscode.lm.invokeTool(
                ToolNames.listVersions,
                { input: { listRuntimes: false }, toolInvocationToken: undefined },
                new vscode.CancellationTokenSource().token
            );

            assert.exists(result, 'Tool should return a result');
            assert.exists(result.content, 'Result should have content');
        }).timeout(standardTimeoutTime);
    });
});
