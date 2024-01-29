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
  FileUtilities,
  IDotnetAcquireContext,
  IDotnetAcquireResult,
  ITelemetryEvent,
  MockExtensionConfiguration,
  MockExtensionContext,
  MockTelemetryReporter,
  MockWindowDisplayWorker
} from 'vscode-dotnet-runtime-library';
import * as extension from '../../extension';
import { warn } from 'console';
/* tslint:disable:no-any */
/* tslint:disable:no-unsafe-finally */

const assert : any = chai.assert;
const standardTimeoutTime = 40000;

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
  }).timeout(standardTimeoutTime);

  test('Install Local Runtime Command', async () => {
    const context: IDotnetAcquireContext = { version: '2.2', requestingExtensionId };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.isTrue(fs.existsSync(result!.dotnetPath));
    assert.include(result!.dotnetPath, '.dotnet');
    assert.include(result!.dotnetPath, context.version);
  }).timeout(standardTimeoutTime);

  test('Uninstall Local Runtime Command', async () => {
    const context: IDotnetAcquireContext = { version: '2.1', requestingExtensionId };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.isTrue(fs.existsSync(result!.dotnetPath!));
    assert.include(result!.dotnetPath, context.version);
    await vscode.commands.executeCommand<string>('dotnet.uninstallAll', context.version);
    assert.isFalse(fs.existsSync(result!.dotnetPath));
  }).timeout(standardTimeoutTime);


  test('Install and Uninstall Multiple Local Runtime Versions', async () => {
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
  }).timeout(standardTimeoutTime * 2);

  test('Install SDK Globally E2E (Requires Admin)', async () => {
    // We only test if the process is running under ADMIN because non-admin requires user-intervention.
    if(new FileUtilities().isElevated())
    {
      const originalPath = process.env.PATH;
      const sdkVersion = '7.0.103';
      const context : IDotnetAcquireContext = { version: sdkVersion, requestingExtensionId: 'sample-extension', installType: 'global' };

      // We cannot use the describe pattern to restore the environment variables using vscode's extension testing infrastructure.
      // So we must set and unset it ourselves, which isn't ideal as this variable could remain.
      let result : IDotnetAcquireResult;
      let error : any;
      let pathAfterInstall;

      // We cannot test much as we don't want to leave global installs on dev boxes. But we do want to make sure the e-2-e goes through the right path. Vendors can test the rest.
      // So we have this environment variable that tells us to stop before running any real install.
      process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH = 'true';
      try
      {
        result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquireGlobalSDK', context);
      }
      catch(err)
      {
        error = err;
      }
      finally
      {
        pathAfterInstall = process.env.PATH;
        process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH = undefined;
        process.env.PATH = originalPath;

        if(error)
        {
          throw(new Error(`The test failed to run the acquire command successfully. Error: ${error}`));
        }
      }

      assert.exists(result!, 'The global acquisition command did not provide a result?');
      assert.exists(result!.dotnetPath);
      assert.equal(result!.dotnetPath, 'fake-sdk');
      assert.exists(pathAfterInstall, 'The environment variable PATH for DOTNET was not found?');
      assert.include(pathAfterInstall, result!.dotnetPath, 'Is the PATH correctly set by the global installer?');
    }
    else
    {
      // We could run the installer without privilege but it would require human interaction to use the UAC
      // And we wouldn't be able to kill the process so the test would leave a lot of hanging processes on the machine
      warn('The Global SDK E2E Install test cannot run as the machine is unprivileged.');
    }
  }).timeout(standardTimeoutTime*1000);

  test('Telemetry Sent During Install and Uninstall', async () => {
    if(!vscode.env.isTelemetryEnabled)
    {
      console.warn('The telemetry test cannot run as VS Code Telemetry is disabled in user settings.');
      return;
    }

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
    assert.include(startedEvent!.properties!.AcquisitionStartVersion, rntVersion, 'Acquisition started event has a starting version');
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
  }).timeout(standardTimeoutTime);

  test('Telemetry Sent on Error', async () => {
    if(!vscode.env.isTelemetryEnabled)
    {
      console.warn('The telemetry test cannot run as VS Code Telemetry is disabled in user settings.');
      return;
    }

    const context: IDotnetAcquireContext = { version: 'foo', requestingExtensionId };
    try {
      await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
      assert.isTrue(false); // An error should have been thrown
    } catch (error) {
      const versionError = MockTelemetryReporter.telemetryEvents.find((event: ITelemetryEvent) => event.eventName === '[ERROR]:DotnetVersionResolutionError');
      assert.exists(versionError, 'The version resolution error appears in telemetry');
    }
  }).timeout(standardTimeoutTime/2);

  test('Install Local Runtime Command Passes With Warning With No RequestingExtensionId', async () => {
    const context: IDotnetAcquireContext = { version: '3.1' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.include(result!.dotnetPath, context.version);
    assert.include(mockDisplayWorker.warningMessage, 'Ignoring existing .NET paths');
  }).timeout(standardTimeoutTime);

  test('Install Local Runtime Command With Path Config Defined', async () => {
    const context: IDotnetAcquireContext = { version: '0.1', requestingExtensionId: 'alternative.extension' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.equal(result!.dotnetPath, 'foo');
  }).timeout(standardTimeoutTime);

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
  }).timeout(standardTimeoutTime);
});
