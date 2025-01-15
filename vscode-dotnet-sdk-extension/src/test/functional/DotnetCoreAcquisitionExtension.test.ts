/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

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
  GlobalInstallerResolver,
  MockEnvironmentVariableCollection,
  MockEventStream,
  MockExtensionConfiguration,
  MockExtensionContext,
  MockTelemetryReporter,
  MockWindowDisplayWorker,
  NoInstallAcquisitionInvoker,
  SdkInstallationDirectoryProvider,
  MockIndexWebRequestWorker,
  getInstallIdCustomArchitecture,
  IExistingPaths,
  getMockAcquisitionContext,
  getMockAcquisitionWorker,
  MockInstallTracker,
} from 'vscode-dotnet-runtime-library';
import * as extension from '../../extension';
import { uninstallSDKExtension } from '../../ExtensionUninstall';
import { warn } from 'console';
import { InstallTrackerSingleton } from 'vscode-dotnet-runtime-library/dist/Acquisition/InstallTrackerSingleton';

const standardTimeoutTime = 100000;
const assert = chai.assert;
chai.use(chaiAsPromised);

const currentSDKVersion = '7.0';
suite('DotnetCoreAcquisitionExtension End to End', function ()
{
suite('DotnetCoreAcquisitionExtension End to End', function()
{
  this.retries(3);
  const storagePath = path.join(__dirname, 'tmp');
  const mockState = new MockExtensionContext();
  const extensionPath = path.join(__dirname, '/../../..');
  const logPath = path.join(__dirname, 'logs');
  const mockDisplayWorker = new MockWindowDisplayWorker();
  const environmentVariableCollection = new MockEnvironmentVariableCollection();
  let extensionContext: vscode.ExtensionContext;
  const mockExistingPaths: IExistingPaths = {
    individualizedExtensionPaths: [{extensionId: 'alternative.extension', path: 'foo'}]
}

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
      extensionConfiguration: new MockExtensionConfiguration(mockExistingPaths.individualizedExtensionPaths!, true, ''),
      displayWorker: mockDisplayWorker,
    });
  });

  this.afterEach(async () => {
    // Tear down tmp storage for fresh run
    mockState.clear();
    MockTelemetryReporter.telemetryEvents = [];
    rimraf.sync(storagePath);
    InstallTrackerSingleton.getInstance(new MockEventStream(), new MockExtensionContext()).clearPromises();
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

    const version = currentSDKVersion;
    const earlierVersion = '3.1';
    const mockContext = getMockAcquisitionContext('sdk', version, 10000, eventStream, context, undefined, installDirectoryProvider);
    const acquisitionWorker = getMockAcquisitionWorker(mockContext);

    // Write 'preinstalled' SDKs
    const dotnetDir = installDirectoryProvider.getInstallDir(version);
    const dotnetExePath = path.join(dotnetDir, `dotnet${os.platform() === 'win32' ? '.exe' : ''}`);

    const sdkCurrentInstallId = getInstallIdCustomArchitecture(version, os.arch(), 'sdk', 'local');
    const sdkDirCurrent = path.join(dotnetDir, 'sdk', sdkCurrentInstallId);

    const sdkEarlierInstallId = getInstallIdCustomArchitecture(earlierVersion, os.arch(), 'sdk', 'local');
    const sdkDirEarlier = path.join(dotnetDir, 'sdk', sdkEarlierInstallId);
    fs.mkdirSync(sdkDirCurrent, { recursive: true });
    fs.mkdirSync(sdkDirEarlier, { recursive: true });
    fs.writeFileSync(dotnetExePath, '');

    // set the event stream of the singleton since this is normally not needed per run
    const _ = new MockInstallTracker(eventStream, mockContext.extensionState);

    // Assert preinstalled SDKs are detected
    const acquisitionInvoker = new NoInstallAcquisitionInvoker(eventStream, acquisitionWorker);
    const result = await acquisitionWorker.acquireLocalSDK(mockContext, acquisitionInvoker);
    assert.equal(path.dirname(result.dotnetPath), dotnetDir, 'preinstalled sdk path is the same as installed sdk path on api call');
    const preinstallEvents = eventStream.events
      .filter(event => event instanceof DotnetPreinstallDetected)
      .map(event => event as DotnetPreinstallDetected);
    assert.equal(preinstallEvents.length, 2);
    assert.exists(preinstallEvents.find(event => event.installId.installId === sdkCurrentInstallId), 'The current sdk install key exists');
    assert.exists(preinstallEvents.find(event => event.installId.installId === sdkEarlierInstallId), 'The earlier sdk install key exists');
    const alreadyInstalledEvent = eventStream.events
      .find(event => event instanceof DotnetAcquisitionAlreadyInstalled) as DotnetAcquisitionAlreadyInstalled;
    assert.exists(alreadyInstalledEvent, 'An already installed event was posted');
    assert.equal(alreadyInstalledEvent.install.installId, sdkCurrentInstallId, 'the current install is what was already installed');

    // Clean up storage
    rimraf.sync(dotnetDir);
  }).timeout(standardTimeoutTime);

  test('Install Status Command with Preinstalled SDK', async () => {
    // Set up acquisition worker
    const installDirectoryProvider = new SdkInstallationDirectoryProvider(storagePath);

    const version = currentSDKVersion;
    const mockContext = getMockAcquisitionContext('sdk', version, 10000, undefined, undefined, undefined, installDirectoryProvider);
    const acquisitionWorker = getMockAcquisitionWorker(mockContext);

    const currentVersionInstallId =  getInstallIdCustomArchitecture(version, os.arch(), 'sdk', 'local');
    InstallTrackerSingleton.getInstance(mockContext.eventStream, mockContext.extensionState).clearPromises();
    // Ensure nothing is returned when there is no preinstalled SDK
    const noPreinstallResult = await acquisitionWorker.acquireStatus(mockContext, 'sdk');
    assert.isUndefined(noPreinstallResult);

    // Write 'preinstalled' SDK
    const dotnetDir = installDirectoryProvider.getInstallDir(version);
    const dotnetExePath = path.join(dotnetDir, `dotnet${os.platform() === 'win32' ? '.exe' : ''}`);

    const sdkDir50 = path.join(dotnetDir, 'sdk', currentVersionInstallId);
    fs.mkdirSync(sdkDir50, { recursive: true });
    fs.writeFileSync(dotnetExePath, '');

    // Assert preinstalled SDKs are detected
    const result = await acquisitionWorker.acquireStatus(mockContext, 'sdk');
    assert.equal(path.dirname(result!.dotnetPath), dotnetDir);

    // Clean up storage
    rimraf.sync(dotnetDir);
  }).timeout(standardTimeoutTime);

  test('Install Command', async () => {
    const context: IDotnetAcquireContext = { version: currentSDKVersion, requestingExtensionId: 'ms-dotnettools.sample-extension' };
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
  }).timeout(standardTimeoutTime);

  test('Install Command with Unknown Extension Id', async () => {
    const context: IDotnetAcquireContext = { version: currentSDKVersion, requestingExtensionId: 'unknown' };
    return assert.isRejected(vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context));
  }).timeout(standardTimeoutTime);

  test('Global Install Version Parsing Handles Different Version Formats Correctly and Gives Expected Installer URL', async () => {
    const majorOnlyVersion = '6';
    const majorMinorVersion = '6.0';
    const featureBandOnlyVersion = '6.0.3xx'; // this should be a full version thats lower than the newest version available.
    const fullVersion = '6.0.311'; // this should be a full version thats lower than the newest version available.

    const newestBandedVersion = '6.0.311';
    const newestVersion = '6.0.408';
    const mockAcquisitionContext = getMockAcquisitionContext('sdk', '');

    const url = 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/6.0/releases.json'
    const webWorker = new MockIndexWebRequestWorker(mockAcquisitionContext, url);
    webWorker.knownUrls.push(url);
    // Note that ZIPS in the data below come before EXEs to make sure the file extension check works.
    const mockJsonFile = path.join(__dirname, '../../..', 'src', 'test', 'mocks', 'mock-releases.json');
    webWorker.matchingUrlResponses.push(fs.readFileSync(mockJsonFile, 'utf8'));

    let resolver : GlobalInstallerResolver = new GlobalInstallerResolver(mockAcquisitionContext, majorOnlyVersion);
    resolver.customWebRequestWorker = webWorker;
    assert.strictEqual(await resolver.getFullySpecifiedVersion(), newestVersion);

    resolver = new GlobalInstallerResolver(mockAcquisitionContext, majorMinorVersion);
    resolver.customWebRequestWorker = webWorker;
    assert.strictEqual(await resolver.getFullySpecifiedVersion(), newestVersion);

    resolver = new GlobalInstallerResolver(mockAcquisitionContext, featureBandOnlyVersion);
    resolver.customWebRequestWorker = webWorker;
    assert.strictEqual(await resolver.getFullySpecifiedVersion(), newestBandedVersion);

    if(os.arch() === 'x64')
    {
      // We check this only on x64 because that matches the build machines and we don't want to duplicate architecture mapping logic
      if(os.platform() === 'win32')
      {
        const expectedWinInstallerUrl = 'https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-win-x64.exe';
        assert.strictEqual(await resolver.getInstallerUrl(), expectedWinInstallerUrl);
      }
      else if(os.platform() === 'darwin')
      {
        const expectedMacInstallerUrl = 'https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-osx-x64.pkg';
        assert.strictEqual(await resolver.getInstallerUrl(), expectedMacInstallerUrl);
      }
    }

    resolver = new GlobalInstallerResolver(mockAcquisitionContext, fullVersion);
    resolver.customWebRequestWorker = webWorker;
    assert.strictEqual(await resolver.getFullySpecifiedVersion(), fullVersion);
  }).timeout(standardTimeoutTime);

  test('Install Command Sets the PATH', async () =>
  {
    const existingPath = process.env.PATH;
    const context: IDotnetAcquireContext = { version: currentSDKVersion, requestingExtensionId: 'ms-dotnettools.sample-extension' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    assert.exists(result, 'The acquisition command did not provide a valid result?');
    assert.exists(result!.dotnetPath);

    const expectedPath = path.dirname(result!.dotnetPath);
    const pathVar = environmentVariableCollection.variables.PATH;

    if(existingPath?.includes('dotnet'))
    {
      warn('The local SDK test could not run on your machine correctly because it has a GLOBAL SDK installed.');
      return;
    }

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
  }).timeout(standardTimeoutTime);

  test('Install Status Command', async () =>
  {
    const existingPath = process.env.PATH;
    if(existingPath?.includes('dotnet'))
    {
      warn('The local SDK test could not run on your machine correctly because it has a GLOBAL SDK installed.');
      return;
    }
    const context: IDotnetAcquireContext = { version: currentSDKVersion, requestingExtensionId: 'ms-dotnettools.sample-extension' };
    let result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquireStatus', context);
    assert.isUndefined(result);

    await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquireStatus', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.isTrue(fs.existsSync(result!.dotnetPath));

    // Clean up storage
    await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
  }).timeout(standardTimeoutTime);

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
  }).timeout(standardTimeoutTime);

  test('Install Multiple Versions', async () => {
    // Install 6.0
    let version = currentSDKVersion;
    let result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', { version, requestingExtensionId: 'ms-dotnettools.sample-extension' });
    assert.exists(result, 'basic install works');
    assert.exists(result!.dotnetPath, 'basic install has path');
    let sdkDirs = fs.readdirSync(path.join(path.dirname(result!.dotnetPath), 'sdk'));
    assert.isNotEmpty(sdkDirs.filter(dir => dir.includes(version)), `sdk directories include version?
PATH: ${result!.dotnetPath}
PATH SUBDIRECTORIES: ${fs.readdirSync(path.dirname(result!.dotnetPath))}
SDK SUBDIRECTORIES: ${sdkDirs}
VERSION: ${version}`);

    // Install 5.0
    version = '5.0';
    result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', { version, requestingExtensionId: 'ms-dotnettools.sample-extension' });
    assert.exists(result, 'acquire works a 2nd time');
    assert.exists(result!.dotnetPath, 'acquire returns a path a 2nd time');
    sdkDirs = fs.readdirSync(path.join(path.dirname(result!.dotnetPath), 'sdk'));
    assert.isNotEmpty(sdkDirs.filter(dir => dir.includes(version)), 'acquire sdk twice does not overwrite');

    sdkDirs = fs.readdirSync(path.join(path.dirname(result!.dotnetPath), 'sdk'));
    assert.isNotEmpty(sdkDirs.filter(dir => dir.includes(currentSDKVersion)), 'directories include a version.');
    assert.isNotEmpty(sdkDirs.filter(dir => dir.includes('5.0')), 'old directories are preserved');

    // Clean up storage
    await vscode.commands.executeCommand('dotnet-sdk.uninstallAll');
  }).timeout(standardTimeoutTime * 6);

  test('Extension Uninstall Removes SDKs', async () => {
    const context: IDotnetAcquireContext = { version: currentSDKVersion, requestingExtensionId: 'ms-dotnettools.sample-extension' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    uninstallSDKExtension();
    assert.isFalse(fs.existsSync(result!.dotnetPath));
  }).timeout(standardTimeoutTime);
});
});