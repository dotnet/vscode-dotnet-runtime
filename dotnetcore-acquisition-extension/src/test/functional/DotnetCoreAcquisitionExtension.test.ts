import * as extension from '../../extension';
import * as fs from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';
import * as vscode from 'vscode';
import { MockExtensionContext } from 'dotnetcore-acquisition-library'
var assert = require('chai').assert;

suite('DotnetCoreAcquisitionExtension End to End', function () {
  const storagePath = path.join(__dirname, "tmp");
  const mockState = new MockExtensionContext;
  const extensionPath = path.join(__dirname, "/../../..");
  let context: vscode.ExtensionContext;

  this.beforeAll(async function() {
    context = {
      subscriptions: [],
      globalStoragePath: storagePath,
      globalState: mockState,
      extensionPath: extensionPath
    } as any;
    extension.activate(context);
  });

  this.afterEach(function() {
    // Tear down tmp storage for fresh run
    rimraf.sync(storagePath);
  });

  test('DotnetCoreAcquisitionExtension: Activate', async () => {
    // 4 commands should now be registered
    assert.exists(context);
    assert.equal(context.subscriptions.length, 4);
  });

  test('DotnetCoreAcquisitionExtension: Install Command', async () => {
    const version = '2.2'
    const dotnetPath = await vscode.commands.executeCommand<string>('dotnet.acquire', version);
    assert.exists(dotnetPath);
    assert.isTrue(fs.existsSync(dotnetPath!));
    assert.include(dotnetPath, version);
  }).timeout(20000);

  test('DotnetCoreAcquisitionExtension: Uninstall Command', async () => {
    const version = '2.1'
    const dotnetPath = await vscode.commands.executeCommand<string>('dotnet.acquire', version);
    assert.exists(dotnetPath);
    assert.isTrue(fs.existsSync(dotnetPath!));
    assert.include(dotnetPath, version);
    await vscode.commands.executeCommand<string>('dotnet.uninstallAll', version);
    assert.isFalse(fs.existsSync(dotnetPath!));
  }).timeout(20000);

  // TODO tests to add:
  //    Installing/ uninstalling multiple versions
  //    Commands besides install/uninstall
  //    Check it doesn't re-download the same version twice
});