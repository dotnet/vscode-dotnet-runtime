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
  IDotnetListVersionsContext,
  IDotnetListVersionsResult,
  MockEnvironmentVariableCollection,
  MockEventStream,
  MockExtensionConfiguration,
  MockExtensionContext,
  MockInstallationValidator,
  MockTelemetryReporter,
  MockWebRequestWorker,
  MockWindowDisplayWorker,
  NoInstallAcquisitionInvoker,
  SdkInstallationDirectoryProvider,
} from 'vscode-dotnet-runtime-library';
import * as extension from '../../extension';
import { uninstallSDKExtension } from '../../ExtensionUninstall';
import { GlobalSDKInstallerResolver } from 'vscode-dotnet-runtime-library/dist/Acquisition/GlobalSDKInstallerResolver';
import { MockIndexWebRequestWorker } from 'vscode-dotnet-runtime-library';
import { warn } from 'console';

const standardTimeoutTime = 100000;
const assert = chai.assert;
chai.use(chaiAsPromised);
/* tslint:disable:no-any */

const mockReleasesData = `{
  "releases-index": [
    {
          "channel-version": "8.0",
          "latest-release": "8.0.0-preview.2",
          "latest-runtime": "8.0.0-preview.2.23128.3",
          "latest-sdk": "8.0.100-preview.2.23157.25",
          "release-type" : "lts",
          "support-phase": "preview"
      },
      {
          "channel-version": "7.0",
          "latest-release": "7.0.4",
          "latest-release-date": "2023-03-14",
          "latest-runtime": "7.0.4",
          "latest-sdk": "7.0.202",
          "release-type" : "sts",
          "support-phase": "active"
      }
    ]
}`

suite('DotnetCoreAcquisitionExtension End to End', function() {
  this.retries(0);
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

  /*test('Activate', async () => {
    // Commands should now be registered
    assert.exists(extensionContext);
    assert.isAbove(extensionContext.subscriptions.length, 0);
  });

  test('List Sdks & Runtimes', async () => {
    const mockWebContext = new MockExtensionContext();
    const eventStream = new MockEventStream();
    const webWorker = new MockWebRequestWorker(mockWebContext, eventStream, '', 'MockKey');
    webWorker.response = mockReleasesData;

    // The API can find the available SDKs and list their versions.
    const apiContext: IDotnetListVersionsContext = { listRuntimes: false };
    const result = await vscode.commands.executeCommand<IDotnetListVersionsResult>('dotnet-sdk.listVersions', apiContext, webWorker);
    assert.exists(result);
    assert.equal(result?.length, 2);
    assert.equal(result?.filter((sdk : any) => sdk.version === '7.0.202').length, 1, 'The mock SDK with the expected version {7.0.200} was not found by the API parsing service.');
    assert.equal(result?.filter((sdk : any) => sdk.channelVersion === '7.0').length, 1, 'The mock SDK with the expected channel version {7.0} was not found by the API parsing service.');
    assert.equal(result?.filter((sdk : any) => sdk.supportPhase === 'active').length, 1, 'The mock SDK with the expected support phase of {active} was not found by the API parsing service.');

    // The API can find the available runtimes and their versions.
    apiContext.listRuntimes = true;
    const runtimeResult = await vscode.commands.executeCommand<IDotnetListVersionsResult>('dotnet-sdk.listVersions', apiContext, webWorker);
    assert.exists(runtimeResult);
    assert.equal(runtimeResult?.length, 2);
    assert.equal(runtimeResult?.filter((runtime : any) => runtime.version === '7.0.4').length, 1, 'The mock Runtime with the expected version was not found by the API parsing service.');
  }).timeout(standardTimeoutTime);

  test('Get Recommended SDK Version', async () => {
    const mockWebContext = new MockExtensionContext();
    const eventStream = new MockEventStream();
    const webWorker = new MockWebRequestWorker(mockWebContext, eventStream, '', 'MockKey');
    webWorker.response = mockReleasesData;

    const result = await vscode.commands.executeCommand<IDotnetVersion>('dotnet-sdk.recommendedVersion', null, webWorker);
    assert.exists(result);
    assert.equal(result?.version, '7.0.202', 'The SDK did not recommend the version it was supposed to, which should be {7.0.200} from the mock data.');
  }).timeout(standardTimeoutTime);

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
    const preinstallEvents = eventStream.events
      .filter(event => event instanceof DotnetPreinstallDetected)
      .map(event => event as DotnetPreinstallDetected);
    assert.equal(preinstallEvents.length, 2);
    assert.exists(preinstallEvents.find(event => event.version === '5.0'));
    assert.exists(preinstallEvents.find(event => event.version === '3.1'));
    const alreadyInstalledEvent = eventStream.events
      .find(event => event instanceof DotnetAcquisitionAlreadyInstalled) as DotnetAcquisitionAlreadyInstalled;
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
  }).timeout(standardTimeoutTime);

  test('Install Command with Unknown Extension Id', async () => {
    const context: IDotnetAcquireContext = { version: '5.0', requestingExtensionId: 'unknown' };
    return assert.isRejected(vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context));
  }).timeout(standardTimeoutTime);

  test('Global Install Version Parsing Handles Different Version Formats Correctly and Gives Expected Installer URL', async () => {
    const mockExtensionContext = new MockExtensionContext();
    const eventStream = new MockEventStream();

    const majorOnlyVersion = '6';
    const majorMinorVersion = '6.0';
    const featureBandOnlyVersion = '6.0.3xx'; // this should be a full version thats lower than the newest version available.
    const fullVersion = '6.0.311'; // this should be a full version thats lower than the newest version available.

    const newestBandedVersion = '6.0.311';
    const newestVersion = '6.0.408';

    let webWorker = new MockIndexWebRequestWorker(mockExtensionContext, eventStream);
    webWorker.knownUrls.push("https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/6.0/releases.json");
    // Note that ZIPS in the data below come before EXEs to make sure the file extension check works.
    webWorker.matchingUrlResponses.push(
    `{
      "channel-version": "6.0",
      "latest-runtime": "6.0.16",
      "latest-sdk": "6.0.408",
      "releases": [
        {
          "runtime": {
            "version": "6.0.16"
          },
          "sdk": {
            "version": "6.0.408",
            "files": []
          },
          "sdks": [
            {
              "version": "6.0.408",
              "files": [
                {
                  "name": "dotnet-sdk-linux-arm.tar.gz",
                  "rid": "linux-arm",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-linux-arm.tar.gz"
                },
                {
                  "name": "dotnet-sdk-linux-arm64.tar.gz",
                  "rid": "linux-arm64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-linux-arm64.tar.gz"
                },
                {
                  "name": "dotnet-sdk-linux-musl-arm.tar.gz",
                  "rid": "linux-musl-arm",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-linux-musl-am.tar.gz"
                },
                {
                  "name": "dotnet-sdk-linux-musl-x64.tar.gz",
                  "rid": "linux-musl-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-linux-musl-x4.tar.gz"
                },
                {
                  "name": "dotnet-sdk-linux-x64.tar.gz",
                  "rid": "linux-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-linux-x64.tar.gz"
                },
                {
                  "name": "dotnet-sdk-osx-arm64.pkg",
                  "rid": "osx-arm64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-osx-arm64.pkg"
                },
                {
                  "name": "dotnet-sdk-osx-arm64.tar.gz",
                  "rid": "osx-arm64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-osx-arm64.tar.gz"
                },
                {
                  "name": "dotnet-sdk-osx-x64.pkg",
                  "rid": "osx-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-osx-x64.pkg"
                },
                {
                  "name": "dotnet-sdk-osx-x64.tar.gz",
                  "rid": "osx-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-osx-x64.tar.gz"
                },
                {
                  "name": "dotnet-sdk-win-arm64.exe",
                  "rid": "win-arm64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-win-arm64.exe"
                },
                {
                  "name": "dotnet-sdk-win-arm64.zip",
                  "rid": "win-arm64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-win-arm64.zip"
                },
                {
                  "name": "dotnet-sdk-win-x64.exe",
                  "rid": "win-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-win-x64.exe"
                },
                {
                  "name": "dotnet-sdk-win-x64.zip",
                  "rid": "win-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-win-x64.zip"
                },
                {
                  "name": "dotnet-sdk-win-x86.exe",
                  "rid": "win-x86",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-win-x86.exe"
                },
                {
                  "name": "dotnet-sdk-win-x86.zip",
                  "rid": "win-x86",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.408-win-x86.zip"
                }
              ]
            },
            {
              "version": "6.0.311",
              "files": [
                {
                  "name": "dotnet-sdk-linux-arm.tar.gz",
                  "rid": "linux-arm",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-linux-arm.tar.gz"
                },
                {
                  "name": "dotnet-sdk-linux-arm64.tar.gz",
                  "rid": "linux-arm64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-linux-arm64.tar.gz"
                },
                {
                  "name": "dotnet-sdk-linux-musl-arm.tar.gz",
                  "rid": "linux-musl-arm",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-linux-musl-am.tar.gz"
                },
                {
                  "name": "dotnet-sdk-linux-musl-x64.tar.gz",
                  "rid": "linux-musl-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-linux-musl-x4.tar.gz"
                },
                {
                  "name": "dotnet-sdk-linux-x64.tar.gz",
                  "rid": "linux-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-linux-x64.tar.gz"
                },
                {
                  "name": "dotnet-sdk-osx-arm64.pkg",
                  "rid": "osx-arm64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-osx-arm64.pkg"
                },
                {
                  "name": "dotnet-sdk-osx-arm64.tar.gz",
                  "rid": "osx-arm64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-osx-arm64.tar.gz"
                },
                {
                  "name": "dotnet-sdk-osx-x64.pkg",
                  "rid": "osx-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-osx-x64.pkg"
                },
                {
                  "name": "dotnet-sdk-osx-x64.tar.gz",
                  "rid": "osx-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-osx-x64.tar.gz"
                },
                {
                  "name": "dotnet-sdk-win-arm64.exe",
                  "rid": "win-arm64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-win-arm64.exe"
                },
                {
                  "name": "dotnet-sdk-win-arm64.zip",
                  "rid": "win-arm64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-win-arm64.zip"
                },
                {
                  "name": "dotnet-sdk-win-x64.zip",
                  "rid": "win-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-win-x64.zip"
                },
                {
                  "name": "dotnet-sdk-win-x64.exe",
                  "rid": "win-x64",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-win-x64.exe"
                },
                {
                  "name": "dotnet-sdk-win-x86.zip",
                  "rid": "win-x86",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-win-x86.zip"
                },
                {
                  "name": "dotnet-sdk-win-x86.exe",
                  "rid": "win-x86",
                  "url": "https://download.visualstudio.microsoft.com/download/pr/dotnet-sdk-6.0.311-win-x86.exe"
                }
              ]
            },
            {
              "version": "6.0.116",
              "files": []
            }
          ]
        }]
    }
    `);

    let resolver : GlobalSDKInstallerResolver = new GlobalSDKInstallerResolver(mockExtensionContext, eventStream, majorOnlyVersion);
    resolver.customWebRequestWorker = webWorker;
    assert.strictEqual(await resolver.getFullVersion(), newestVersion);

    resolver = new GlobalSDKInstallerResolver(mockExtensionContext, eventStream, majorMinorVersion);
    resolver.customWebRequestWorker = webWorker;
    assert.strictEqual(await resolver.getFullVersion(), newestVersion);

    resolver = new GlobalSDKInstallerResolver(mockExtensionContext, eventStream, featureBandOnlyVersion);
    resolver.customWebRequestWorker = webWorker;
    assert.strictEqual(await resolver.getFullVersion(), newestBandedVersion);

    if(os.arch() === 'x64')
    {
      // We check this only on x64 because that matches the build machines and we dont want to duplicate architecture mapping logic
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

    resolver = new GlobalSDKInstallerResolver(mockExtensionContext, eventStream, fullVersion);
    resolver.customWebRequestWorker = webWorker;
    assert.strictEqual(await resolver.getFullVersion(), fullVersion);
  }).timeout(maxTimeoutTime);
  */
  test('Install Globally (Requires Admin)', async () => {
    // We only test if the process is running under ADMIN because non-admin requires user-intervention.
    if(DotnetCoreAcquisitionWorker.isElevated())
    {
      const version : string = '7.0.103';

      const context : IDotnetAcquireContext = { version: version, requestingExtensionId: 'ms-dotnettools.sample-extension', installType: 'global' };
      const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
      assert.exists(result, "The global acquisition command did not provide a result?");
      assert.exists(result!.dotnetPath);

      const installersDir : string = DotnetCoreAcquisitionWorker.getInstallerDownloadFolder();
      assert.exists(installersDir);
      const numInstallersAlreadyDownloaded = fs.readdirSync(installersDir).length;
      // The installer should be removed from the disk after the command is done.
      assert(numInstallersAlreadyDownloaded === 0);

      // Assert install occurred
      let sdkDirs = fs.readdirSync(path.join(path.dirname(result!.dotnetPath), 'sdk'));
      assert.isNotEmpty(sdkDirs.filter(dir => dir.includes(version)));

      if(os.platform() === 'win32')
      {
        // TODO Assert that it can find the existing install in registry and doesnt re-install but also doesn't fail.
      }
    }
    else
    {
      // We could run the installer without privellege but it would require human interaction to use the UAC
      // And we wouldn't be able to kill the process so the test would leave a lot of hanging procs on the machine
      warn("The Global SDK Install test cannot run as the machine is unprivelleged.");
    }
  }).timeout(maxTimeoutTime);

  test('Install Command Sets the PATH', async () => {
    const context: IDotnetAcquireContext = { version: '5.0', requestingExtensionId: 'ms-dotnettools.sample-extension' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    assert.exists(result, "The acquisition command did not provide a valid result?");
    assert.exists(result!.dotnetPath);

    const expectedPath = path.dirname(result!.dotnetPath);
    const pathVar = environmentVariableCollection.variables.PATH;
    assert.exists(pathVar, "The environment variable PATH for DOTNET was not found?");
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
  }).timeout(standardTimeoutTime * 6);

  test('Extension Uninstall Removes SDKs', async () => {
    const context: IDotnetAcquireContext = { version: '5.0', requestingExtensionId: 'ms-dotnettools.sample-extension' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet-sdk.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    uninstallSDKExtension();
    assert.isFalse(fs.existsSync(result!.dotnetPath));
  }).timeout(standardTimeoutTime);
});
