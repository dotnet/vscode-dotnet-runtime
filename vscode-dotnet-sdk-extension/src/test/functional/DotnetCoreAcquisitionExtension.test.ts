/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  IDotnetAcquireContext,
  IDotnetAcquireResult,
  MockExtensionConfiguration,
  MockExtensionContext,
  MockTelemetryReporter,
  MockWindowDisplayWorker,
} from 'vscode-dotnet-runtime-library';
import {
  uninstallSDKExtension,
} from 'vscode-dotnet-uninstall-library';
import * as extension from '../../extension';
const assert = chai.assert;
/* tslint:disable:no-any */

suite('DotnetCoreAcquisitionExtension End to End', function() {
  this.retries(3);
  const storagePath = path.join(__dirname, 'tmp');
  const mockState = new MockExtensionContext();
  const extensionPath = path.join(__dirname, '/../../..');
  const logPath = path.join(__dirname, 'logs');
  const mockDisplayWorker = new MockWindowDisplayWorker();
  let extensionContext: vscode.ExtensionContext;

  this.beforeAll(async () => {
    extensionContext = {
      subscriptions: [],
      globalStoragePath: storagePath,
      globalState: mockState,
      extensionPath,
      logPath,
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
    assert.include(result!.dotnetPath, context.version);
    if (os.platform() === 'win32') {
      assert.include(result!.dotnetPath, process.env.APPDATA!);
    }
    assert.isTrue(fs.existsSync(result!.dotnetPath));
    // Clean up storage
    await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
  }).timeout(100000);

  test('Uninstall Command', async () => {
    const context: IDotnetAcquireContext = { version: '3.1' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.include(result!.dotnetPath, context.version);
    assert.isTrue(fs.existsSync(result!.dotnetPath!));
    await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
    assert.isFalse(fs.existsSync(result!.dotnetPath));
  }).timeout(100000);

  test('Install Multiple Versions', async () => {
    const versions = ['3.1', '5.0'];
    let dotnetPaths: string[] = [];
    for (const version of versions) {
      const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', { version });
      assert.exists(result);
      assert.exists(result!.dotnetPath);
      assert.include(result!.dotnetPath, version);
      if (result!.dotnetPath) {
        dotnetPaths = dotnetPaths.concat(result!.dotnetPath);
      }
    }
    // All versions are still there after all installs are completed
    for (const dotnetPath of dotnetPaths) {
      assert.isTrue(fs.existsSync(dotnetPath));
    }
    // Clean up storage
    await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
  }).timeout(600000);

  test('Extension Uninstall Removes SDKs on Windows', async () => {
    if (os.platform() === 'win32') {
      const context: IDotnetAcquireContext = { version: '5.0' };
      const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
      assert.exists(result);
      assert.exists(result!.dotnetPath);
      uninstallSDKExtension();
      assert.isFalse(fs.existsSync(result!.dotnetPath));
    }
  }).timeout(100000);
});
