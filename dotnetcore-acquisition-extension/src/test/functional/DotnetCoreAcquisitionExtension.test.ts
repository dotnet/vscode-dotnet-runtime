/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import { MockExtensionContext } from 'dotnetcore-acquisition-library';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import * as rimraf from 'rimraf';
import * as vscode from 'vscode';
import * as extension from '../../extension';
const assert = chai.assert;

suite('DotnetCoreAcquisitionExtension End to End', function() {
  const storagePath = path.join(__dirname, 'tmp');
  const mockState = new MockExtensionContext();
  const extensionPath = path.join(__dirname, '/../../..');
  let context: vscode.ExtensionContext;

  this.beforeAll(async () => {
    context = {
      subscriptions: [],
      globalStoragePath: storagePath,
      globalState: mockState,
      extensionPath,
    } as any;
    extension.activate(context);
  });

  this.afterEach(async () => {
    // Tear down tmp storage for fresh run
    await vscode.commands.executeCommand<string>('dotnet.uninstallAll');
    mockState.clear();
    rimraf.sync(storagePath);
  });

  test('Activate', async () => {
    // Commands should now be registered
    assert.exists(context);
    assert.isAbove(context.subscriptions.length, 0);
  });

  test('Install Command', async () => {
    const version = '2.2';
    const dotnetPath = await vscode.commands.executeCommand<string>('dotnet.acquire', version);
    assert.exists(dotnetPath);
    assert.isTrue(fs.existsSync(dotnetPath!));
    assert.include(dotnetPath, version);
  }).timeout(20000);

  test('Uninstall Command', async () => {
    const version = '2.1';
    const dotnetPath = await vscode.commands.executeCommand<string>('dotnet.acquire', version);
    assert.exists(dotnetPath);
    assert.isTrue(fs.existsSync(dotnetPath!));
    assert.include(dotnetPath, version);
    await vscode.commands.executeCommand<string>('dotnet.uninstallAll', version);
    assert.isFalse(fs.existsSync(dotnetPath!));
  }).timeout(20000);

  test('Install and Uninstall Multiple Versions', async () => {
    const versions = ['1.1', '2.2', '1.0'];
    let dotnetPaths: string[] = [];
    for (const version of versions) {
      const dotnetPath = await vscode.commands.executeCommand<string>('dotnet.acquire', version);
      assert.exists(dotnetPath);
      assert.include(dotnetPath, version);
      if (dotnetPath) {
        dotnetPaths = dotnetPaths.concat(dotnetPath);
      }
    }
    // All versions are still there after all installs are completed
    for (const dotnetPath of dotnetPaths) {
      assert.isTrue(fs.existsSync(dotnetPath));
    }
  }).timeout(40000);
});
