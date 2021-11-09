/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');
import * as vscode from 'vscode';
import {
  DotnetAcquisitionAlreadyInstalled,
  DotnetCoreAcquisitionWorker,
  DotnetPreinstallDetected,
  IDotnetAcquireContext,
  IDotnetAcquireResult,
  MockEnvironmentVariableCollection,
  MockEventStream,
  MockExtensionConfiguration,
  MockExtensionContext,
  MockInstallationValidator,
  MockTelemetryReporter,
  MockWindowDisplayWorker,
  NoInstallAcquisitionInvoker,
  SdkInstallationDirectoryProvider,
} from 'vscode-dotnet-runtime-library';
import * as extension from '../../extension';
import { uninstallSDKExtension } from '../../ExtensionUninstall';
const assert = chai.assert;
chai.use(chaiAsPromised);
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
      extensionConfiguration: new MockExtensionConfiguration([{extensionId: 'ms-dotnettools.sample-extension', path: 'foo'}], true),
      displayWorker: mockDisplayWorker,
    });
  });

  test('Activate', async () => {
    // Commands should now be registered
    assert.exists(extensionContext);
    assert.isAbove(extensionContext.subscriptions.length, 0);
  });

  test('Detect Preinstalled SDK', async () => {
    // Set up acquisition worker
    const context = new MockExtensionContext();
    const eventStream = new MockEventStream();
    const installDirectoryProvider = new SdkInstallationDirectoryProvider(storagePath);
    const acquisitionWorker = new DotnetCoreAcquisitionWorker({
        storagePath: '',
        extensionState: context,
        eventStream,
        acquisitionInvoker: new NoInstallAcquisitionInvoker(eventStream),
        installationValidator: new MockInstallationValidator(eventStream),
        timeoutValue: 10,
        installDirectoryProvider,
    });
    const version = '5.0';

    // Write 'preinstalled' SDKs
    const dotnetDir = installDirectoryProvider.getInstallDir(version);
    const dotnetExePath = path.join(dotnetDir, `dotnet${ os.platform() === 'win32' ? '.exe' : '' }`);
    const sdkDir50 = path.join(dotnetDir, 'sdk', version);
    const sdkDir31 = path.join(dotnetDir, 'sdk', '3.1');
    fs.mkdirSync(sdkDir50, { recursive: true });
    fs.mkdirSync(sdkDir31, { recursive: true });
    fs.writeFileSync(dotnetExePath, '');

    // Assert preinstalled SDKs are detected
    const result = await acquisitionWorker.acquireSDK(version);
    assert.equal(path.dirname(result.dotnetPath), dotnetDir);
    const preinstallEvents = eventStream.events
      .filter(event => event instanceof DotnetPreinstallDetected)
      .map(event => event as DotnetPreinstallDetected);
    assert.equal(preinstallEvents.length, 2);
    assert.exists(preinstallEvents.find(event => event.version === '5.0'));
    assert.exists(preinstallEvents.find(event => event.version === '3.1'));
    const alreadyInstalledEvent = eventStream.events
      .find(event => event instanceof DotnetAcquisitionAlreadyInstalled) as DotnetAcquisitionAlreadyInstalled;
    assert.exists(alreadyInstalledEvent);
    assert.equal(alreadyInstalledEvent.version, '5.0');

    // Clean up storage
    rimraf.sync(dotnetDir);
  });

  test('Install Status Command with Preinstalled SDK', async () => {
    // Set up acquisition worker
    const context = new MockExtensionContext();
    const eventStream = new MockEventStream();
    const installDirectoryProvider = new SdkInstallationDirectoryProvider(storagePath);
    const acquisitionWorker = new DotnetCoreAcquisitionWorker({
        storagePath: '',
        extensionState: context,
        eventStream,
        acquisitionInvoker: new NoInstallAcquisitionInvoker(eventStream),
        installationValidator: new MockInstallationValidator(eventStream),
        timeoutValue: 10,
        installDirectoryProvider,
    });
    const version = '5.0';

    // Ensure nothing is returned when there is no preinstalled SDK
    const noPreinstallResult = await acquisitionWorker.acquireStatus(version, false);
    assert.isUndefined(noPreinstallResult);

    // Write 'preinstalled' SDK
    const dotnetDir = installDirectoryProvider.getInstallDir(version);
    const dotnetExePath = path.join(dotnetDir, `dotnet${ os.platform() === 'win32' ? '.exe' : '' }`);
    const sdkDir50 = path.join(dotnetDir, 'sdk', version);
    fs.mkdirSync(sdkDir50, { recursive: true });
    fs.writeFileSync(dotnetExePath, '');

    // Assert preinstalled SDKs are detected
    const result = await acquisitionWorker.acquireStatus(version, false);
    assert.equal(path.dirname(result!.dotnetPath), dotnetDir);

    // Clean up storage
    rimraf.sync(dotnetDir);
  });

  test('Install Command', async () => {
    const context: IDotnetAcquireContext = { version: '5.0', requestingExtensionId: 'ms-dotnettools.sample-extension' };
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

  test('Install Command with Unknown Extension Id', async () => {
    const context: IDotnetAcquireContext = { version: '5.0', requestingExtensionId: 'unknown' };
    return assert.isRejected(vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context));
  }).timeout(100000);

  test('Install Command Sets the PATH', async () => {
    const context: IDotnetAcquireContext = { version: '5.0', requestingExtensionId: 'ms-dotnettools.sample-extension' };
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
    const context: IDotnetAcquireContext = { version: '5.0', requestingExtensionId: 'ms-dotnettools.sample-extension' };
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
    const context: IDotnetAcquireContext = { version: '3.1', requestingExtensionId: 'ms-dotnettools.sample-extension' };
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
    let result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', { version, requestingExtensionId: 'ms-dotnettools.sample-extension' });
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    let sdkDirs = fs.readdirSync(path.join(path.dirname(result!.dotnetPath), 'sdk'));
    assert.isNotEmpty(sdkDirs.filter(dir => dir.includes(version)));

    // Install 5.0
    version = '5.0';
    result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', { version, requestingExtensionId: 'ms-dotnettools.sample-extension' });
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
    const context: IDotnetAcquireContext = { version: '5.0', requestingExtensionId: 'ms-dotnettools.sample-extension' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    uninstallSDKExtension();
    assert.isFalse(fs.existsSync(result!.dotnetPath));
  }).timeout(100000);
});
