/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  IDotnetAcquireContext,
  IDotnetAcquireResult,
  MockEnvironmentVariableCollection,
  MockExtensionConfiguration,
  MockExtensionContext,
  MockTelemetryReporter,
  MockWindowDisplayWorker,
} from 'vscode-dotnet-runtime-library';
import * as extension from '../../extension';
import { uninstallSDKExtension } from '../../ExtensionUninstall';
const assert = chai.assert;
/* tslint:disable:no-any */

suite('DotnetCoreAcquisitionExtension End to End', function() {
  this.retries(3);
  const storagePath = path.join(__dirname, 'tmp');
  const mockState = new MockExtensionContext();
  const extensionPath = path.join(__dirname, '/../../..');
  const logPath = path.join(__dirname, 'logs');
  const mockDisplayWorker = new MockWindowDisplayWorker();
  const environmentVariableCollection = new MockEnvironmentVariableCollection();
  let extensionContext: vscode.ExtensionContext;

  this.beforeAll(async () => {
    extensionContext = {
      subscriptions: [],
      globalStoragePath: storagePath,
      globalState: mockState,
      extensionPath,
      logPath,
      environmentVariableCollection,
    } as any;
    extension.activate(extensionContext, {
      telemetryReporter: new MockTelemetryReporter(),
      extensionConfiguration: new MockExtensionConfiguration([{extensionId: 'alternative.extension', path: 'foo'}], true),
      displayWorker: mockDisplayWorker,
    });
  });

  test('Activate', async () => {
    // Commands should now be registered
    assert.exists(extensionContext);
    assert.isAbove(extensionContext.subscriptions.length, 0);
  });

  test('Install Command', async () => {
    const context: IDotnetAcquireContext = { version: '5.0' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.include(result!.dotnetPath, '.dotnet');
    const sdkDir = fs.readdirSync(path.join(path.dirname(result!.dotnetPath), 'sdk'))[0];
    assert.include(sdkDir, context.version);
    if (os.platform() === 'win32') {
      assert.include(result!.dotnetPath, process.env.APPDATA!);
    }
    assert.isTrue(fs.existsSync(result!.dotnetPath));
    // Clean up storage
    await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
  }).timeout(100000);

  test('Install Command Sets the PATH', async () => {
    const context: IDotnetAcquireContext = { version: '5.0' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);

    const expectedPath = path.dirname(result!.dotnetPath);
    const pathVar = environmentVariableCollection.variables.PATH;
    assert.include(pathVar, expectedPath);

    let pathResult: string;
    if (os.platform() === 'win32') {
      pathResult = cp.execSync(`%SystemRoot%\\System32\\reg.exe query "HKCU\\Environment" /v "Path"`).toString();
    } else if (os.platform() === 'darwin') {
      pathResult = fs.readFileSync(path.join(os.homedir(), '.zshrc')).toString();
    } else {
      pathResult = fs.readFileSync(path.join(os.homedir(), '.profile')).toString();
    }
    assert.include(pathResult, expectedPath);

    // Clean up storage
    await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
  }).timeout(100000);

  test('Install Status Command', async () => {
    const context: IDotnetAcquireContext = { version: '5.0' };
    let result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquireStatus', context);
    assert.isUndefined(result);

    await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquireStatus', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.isTrue(fs.existsSync(result!.dotnetPath));

    // Clean up storage
    await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
  }).timeout(100000);

  test('Uninstall Command', async () => {
    const context: IDotnetAcquireContext = { version: '3.1' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    const sdkDir = fs.readdirSync(path.join(path.dirname(result!.dotnetPath), 'sdk'))[0];
    assert.include(sdkDir, context.version);
    assert.isTrue(fs.existsSync(result!.dotnetPath!));
    await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
    assert.isFalse(fs.existsSync(result!.dotnetPath));
  }).timeout(100000);

  test('Install Multiple Versions', async () => {
    // Install 3.1
    let version = '3.1';
    let result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', { version });
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    let sdkDirs = fs.readdirSync(path.join(path.dirname(result!.dotnetPath), 'sdk'));
    assert.isNotEmpty(sdkDirs.filter(dir => dir.includes(version)));

    // Install 5.0
    version = '5.0';
    result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', { version });
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    sdkDirs = fs.readdirSync(path.join(path.dirname(result!.dotnetPath), 'sdk'));
    assert.isNotEmpty(sdkDirs.filter(dir => dir.includes(version)));

    // 5.0 and 3.1 SDKs should still be installed
    sdkDirs = fs.readdirSync(path.join(path.dirname(result!.dotnetPath), 'sdk'));
    assert.isNotEmpty(sdkDirs.filter(dir => dir.includes('3.1')));
    assert.isNotEmpty(sdkDirs.filter(dir => dir.includes('5.0')));

    // Clean up storage
    await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
  }).timeout(600000);

  test('Extension Uninstall Removes SDKs', async () => {
    const context: IDotnetAcquireContext = { version: '5.0' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    uninstallSDKExtension();
    assert.isFalse(fs.existsSync(result!.dotnetPath));
  }).timeout(100000);
});
