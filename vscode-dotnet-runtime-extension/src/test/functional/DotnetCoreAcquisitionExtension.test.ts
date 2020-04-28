/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';
import * as vscode from 'vscode';
import {
  IDotnetAcquireContext,
  IDotnetAcquireResult,
  MockExtensionContext,
  MockTelemetryReporter,
} from 'vscode-dotnet-runtime-library';
import * as extension from '../../extension';
const assert = chai.assert;

suite('DotnetCoreAcquisitionExtension End to End', function() {
  this.retries(3);
  const storagePath = path.join(__dirname, 'tmp');
  const mockState = new MockExtensionContext();
  const extensionPath = path.join(__dirname, '/../../..');
  const logPath = path.join(__dirname, 'logs');
  let extensionContext: vscode.ExtensionContext;

  this.beforeAll(async () => {
    extensionContext = {
      subscriptions: [],
      globalStoragePath: storagePath,
      globalState: mockState,
      extensionPath,
      logPath,
    } as any;
    extension.activate(extensionContext, {telemetryReporter: new MockTelemetryReporter()});
  });

  this.afterEach(async () => {
    // Tear down tmp storage for fresh run
    await vscode.commands.executeCommand<string>('dotnet.uninstallAll');
    mockState.clear();
    MockTelemetryReporter.telemetryEvents = [];
    rimraf.sync(storagePath);
  });

  test('Activate', async () => {
    // Commands should now be registered
    assert.exists(extensionContext);
    assert.isAbove(extensionContext.subscriptions.length, 0);
  });

  test('Install Command', async () => {
    const context: IDotnetAcquireContext = { version: '2.2' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.isTrue(fs.existsSync(result!.dotnetPath));
    assert.include(result!.dotnetPath, context.version);
  }).timeout(40000);

  test('Uninstall Command', async () => {
    const context: IDotnetAcquireContext = { version: '2.1' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.isTrue(fs.existsSync(result!.dotnetPath!));
    assert.include(result!.dotnetPath, context.version);
    await vscode.commands.executeCommand<string>('dotnet.uninstallAll', context.version);
    assert.isFalse(fs.existsSync(result!.dotnetPath));
  }).timeout(40000);

  test('Install and Uninstall Multiple Versions', async () => {
    const versions = ['2.2', '3.0', '3.1'];
    let dotnetPaths: string[] = [];
    for (const version of versions) {
      const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', { version });
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
  }).timeout(60000);

  test('Telemetry Sent During Install and Uninstall', async () => {
    const context: IDotnetAcquireContext = { version: '2.2' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.include(result!.dotnetPath, context.version);
    // Check that we got the expected telemetry
    const startedEvent = MockTelemetryReporter.telemetryEvents.find((event: any) => event.eventName === 'DotnetAcquisitionStarted');
    assert.exists(startedEvent);
    assert.include(startedEvent!.properties!.AcquisitionStartVersion, '2.2');
    const completedEvent = MockTelemetryReporter.telemetryEvents.find((event: any) => event.eventName === 'DotnetAcquisitionCompleted');
    assert.exists(completedEvent);
    assert.include(completedEvent!.properties!.AcquisitionCompletedVersion, '2.2');

    await vscode.commands.executeCommand<string>('dotnet.uninstallAll');
    assert.isFalse(fs.existsSync(result!.dotnetPath));
    const uninstallStartedEvent = MockTelemetryReporter.telemetryEvents.find((event: any) => event.eventName === 'DotnetUninstallAllStarted');
    assert.exists(uninstallStartedEvent);
    const uninstallCompletedEvent = MockTelemetryReporter.telemetryEvents.find((event: any) => event.eventName === 'DotnetUninstallAllCompleted');
    assert.exists(uninstallCompletedEvent);
    // Check that no errors were reported
    const errors = MockTelemetryReporter.telemetryEvents.filter((event: any) => event.eventName.includes('Error'));
    assert.isEmpty(errors);
  }).timeout(40000);

  test('Telemetry Sent on Error', async () => {
    const context: IDotnetAcquireContext = { version: 'foo' };
    try {
      await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
      assert(false); // An error should have been thrown
    } catch (error) {
      const versionError = MockTelemetryReporter.telemetryEvents.find((event: any) => event.eventName === 'DotnetVersionResolutionError');
      assert.exists(versionError);
    }
  }).timeout(2000);
});
