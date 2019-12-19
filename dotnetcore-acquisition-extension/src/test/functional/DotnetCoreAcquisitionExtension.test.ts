/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import {
  MockExtensionContext,
  MockTelemetryReporter,
} from 'dotnetcore-acquisition-library';
import * as fs from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';
import * as vscode from 'vscode';
import * as extension from '../../extension';
const assert = chai.assert;

suite('DotnetCoreAcquisitionExtension End to End', function() {
  const storagePath = path.join(__dirname, 'tmp');
  const mockState = new MockExtensionContext();
  const extensionPath = path.join(__dirname, '/../../..');
  const logPath = path.join(__dirname, 'tmp');
  let context: vscode.ExtensionContext;

  this.beforeAll(async () => {
    context = {
      subscriptions: [],
      globalStoragePath: storagePath,
      globalState: mockState,
      extensionPath,
      logPath,
    } as any;
    extension.activate(context);
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

  test('Telemetry Sent During Install and Uninstall', async () => {
    const version = '2.2';
    const dotnetPath = await vscode.commands.executeCommand<string>('dotnet.acquire', version);
    assert.exists(dotnetPath);
    assert.include(dotnetPath, version);
    // Check that we got the expected telemetry
    const startedEvent = MockTelemetryReporter.telemetryEvents.find((event: any) => event.eventName === 'DotnetAcquisitionStarted');
    assert.exists(startedEvent);
    assert.include(startedEvent!.properties!.AcquisitionStartVersion, '2.2');
    const completedEvent = MockTelemetryReporter.telemetryEvents.find((event: any) => event.eventName === 'DotnetAcquisitionCompleted');
    assert.exists(completedEvent);
    assert.include(completedEvent!.properties!.AcquisitionCompletedVersion, '2.2');
    assert.equal(completedEvent!.properties!.AcquisitionCompletedDotnetPath, dotnetPath);

    await vscode.commands.executeCommand<string>('dotnet.uninstallAll', version);
    assert.isFalse(fs.existsSync(dotnetPath!));
    const uninstallStartedEvent = MockTelemetryReporter.telemetryEvents.find((event: any) => event.eventName === 'DotnetUninstallAllStarted');
    assert.exists(uninstallStartedEvent);
    const uninstallCompletedEvent = MockTelemetryReporter.telemetryEvents.find((event: any) => event.eventName === 'DotnetUninstallAllCompleted');
    assert.exists(uninstallCompletedEvent);
    // Check that no errors were reported
    const errors = MockTelemetryReporter.telemetryEvents.filter((event: any) => event.eventName.includes('Error'));
    assert.isEmpty(errors);
  }).timeout(20000);

  test('Telemetry Sent on Error', async () => {
    const version = 'foo';
    try {
      await vscode.commands.executeCommand<string>('dotnet.acquire', version);
      assert(false); // An error should have been thrown
    } catch (error) {
      const versionError = MockTelemetryReporter.telemetryEvents.find((event: any) => event.eventName === 'DotnetVersionResolutionError');
      assert.exists(versionError);
      assert.equal(versionError!.properties!.ErrorMessage, error);
    }
  }).timeout(1000);
});
