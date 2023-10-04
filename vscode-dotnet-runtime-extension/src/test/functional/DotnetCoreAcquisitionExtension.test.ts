/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as rimraf from 'rimraf';
import * as vscode from 'vscode';
import {
  DotnetCoreAcquisitionWorker,
  IDotnetAcquireContext,
  IDotnetAcquireResult,
  ITelemetryEvent,
  MockExtensionConfiguration,
  MockExtensionContext,
  MockTelemetryReporter,
  MockWindowDisplayWorker,
} from 'vscode-dotnet-runtime-library';
import * as extension from '../../extension';
/* tslint:disable:no-any */
const assert : any = chai.assert;

suite('DotnetCoreAcquisitionExtension End to End', function() {
  this.retries(3);
  const storagePath = path.join(__dirname, 'tmp');
  const mockState = new MockExtensionContext();
  const extensionPath = path.join(__dirname, '/../../..');
  const logPath = path.join(__dirname, 'logs');
  const requestingExtensionId = 'fake.extension';
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
    const context: IDotnetAcquireContext = { version: '2.2', requestingExtensionId };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.isTrue(fs.existsSync(result!.dotnetPath));
    assert.include(result!.dotnetPath, '.dotnet');
    assert.include(result!.dotnetPath, context.version);
  }).timeout(40000);

  test('Uninstall Command', async () => {
    const context: IDotnetAcquireContext = { version: '2.1', requestingExtensionId };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.isTrue(fs.existsSync(result!.dotnetPath!));
    assert.include(result!.dotnetPath, context.version);
    await vscode.commands.executeCommand<string>('dotnet.uninstallAll', context.version);
    assert.isFalse(fs.existsSync(result!.dotnetPath));
  }).timeout(400000);

  test('Install and Uninstall Multiple Versions', async () => {
    const versions = ['2.2', '3.0', '3.1'];
    let dotnetPaths: string[] = [];
    for (const version of versions) {
      const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', { version, requestingExtensionId });
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
    const rntVersion = '2.2';
    const fullyResolvedVersion = '2.2.8'; // 2.2 is very much out of support, so we don't expect this to change to a newer version
    const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(fullyResolvedVersion, os.arch());

    const context: IDotnetAcquireContext = { version: rntVersion, requestingExtensionId };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.include(result!.dotnetPath, context.version);
    // Check that we got the expected telemetry
    const requestedEvent = MockTelemetryReporter.telemetryEvents.find((event: ITelemetryEvent) => event.eventName === 'DotnetAcquisitionRequested');
    assert.exists(requestedEvent, 'The acquisition requested event is found');
    assert.include(requestedEvent!.properties!.AcquisitionStartVersion, rntVersion, 'The acquisition requested event contains the version');
    // assert that the extension id is hashed by checking that it DNE
    assert.notInclude(requestedEvent!.properties!.RequestingExtensionId, requestingExtensionId, 'The extension id is hashed in telemetry');

    const startedEvent = MockTelemetryReporter.telemetryEvents.find((event: ITelemetryEvent) => event.eventName === 'DotnetAcquisitionStarted');
    assert.exists(startedEvent, 'Acquisition started event gets published');
    assert.include(startedEvent!.properties!.AcquisitionStartVersion, '2.2', 'Acquisition started event has a starting version');
    assert.include(startedEvent!.properties!.AcquisitionInstallKey, installKey, 'Acquisition started event has a install key');

    const completedEvent = MockTelemetryReporter.telemetryEvents.find((event: ITelemetryEvent) => event.eventName === 'DotnetAcquisitionCompleted');
    assert.exists(completedEvent, 'Acquisition completed events exist');
    assert.include(completedEvent!.properties!.AcquisitionCompletedVersion, rntVersion, 'Acquisition completed events have a version');

    await vscode.commands.executeCommand<string>('dotnet.uninstallAll');
    assert.isFalse(fs.existsSync(result!.dotnetPath), 'Dotnet is uninstalled correctly.');
    const uninstallStartedEvent = MockTelemetryReporter.telemetryEvents.find((event: ITelemetryEvent) => event.eventName === 'DotnetUninstallAllStarted');
    assert.exists(uninstallStartedEvent, 'Uninstall All is reported in telemetry');

    const uninstallCompletedEvent = MockTelemetryReporter.telemetryEvents.find((event: ITelemetryEvent) => event.eventName === 'DotnetUninstallAllCompleted');
    assert.exists(uninstallCompletedEvent, 'Uninstall All success is reported in telemetry');
    // Check that no errors were reported
    const errors = MockTelemetryReporter.telemetryEvents.filter((event: ITelemetryEvent) => event.eventName.includes('Error'));
    assert.isEmpty(errors, 'No error events were reported in telemetry reporting');
  }).timeout(40000);

  test('Telemetry Sent on Error', async () => {
    const context: IDotnetAcquireContext = { version: 'foo', requestingExtensionId };
    try {
      await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
      assert.isTrue(false); // An error should have been thrown
    } catch (error) {
      const versionError = MockTelemetryReporter.telemetryEvents.find((event: ITelemetryEvent) => event.eventName === '[ERROR]:DotnetVersionResolutionError');
      assert.exists(versionError, 'The version resolution error appears in telemetry');
    }
  }).timeout(2000);

  test('Install Command Passes With Warning With No RequestingExtensionId', async () => {
    const context: IDotnetAcquireContext = { version: '3.1' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.include(result!.dotnetPath, context.version);
    assert.include(mockDisplayWorker.warningMessage, 'Ignoring existing .NET paths');
  }).timeout(40000);

  test('Install Command With Path Config Defined', async () => {
    const context: IDotnetAcquireContext = { version: '0.1', requestingExtensionId: 'alternative.extension' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.equal(result!.dotnetPath, 'foo');
  });

  test('Install Runtime Status Command', async () => {
    // Runtime is not yet installed
    const context: IDotnetAcquireContext = { version: '3.1', requestingExtensionId };
    let result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquireStatus', context);
    assert.notExists(result);

    // Install runtime
    result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.isTrue(fs.existsSync(result!.dotnetPath!));

    // Runtime has been installed
    result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquireStatus', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.isTrue(fs.existsSync(result!.dotnetPath!));
    rimraf.sync(result!.dotnetPath!);
  }).timeout(40000);
});
