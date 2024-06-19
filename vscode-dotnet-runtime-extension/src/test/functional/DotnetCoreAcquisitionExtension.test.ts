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
  FileUtilities,
  IDotnetAcquireContext,
  IDotnetAcquireResult,
  IExistingPaths,
  IDotnetListVersionsContext,
  IDotnetListVersionsResult,
  getInstallKeyCustomArchitecture,
  ITelemetryEvent,
  MockExtensionConfiguration,
  MockExtensionContext,
  MockTelemetryReporter,
  MockWebRequestWorker,
  MockWindowDisplayWorker,
  getMockAcquisitionContext,
  DotnetInstallMode
} from 'vscode-dotnet-runtime-library';
import * as extension from '../../extension';
import { warn } from 'console';
/* tslint:disable:no-any */
/* tslint:disable:no-unsafe-finally */

const assert : any = chai.assert;
const standardTimeoutTime = 40000;

suite('DotnetCoreAcquisitionExtension End to End', function()
{
  this.retries(3);
  const storagePath = path.join(__dirname, 'tmp');
  const mockState = new MockExtensionContext();
  const extensionPath = path.join(__dirname, '/../../..');
  const logPath = path.join(__dirname, 'logs');
  const requestingExtensionId = 'fake.extension';
  const mockDisplayWorker = new MockWindowDisplayWorker();
  let extensionContext: vscode.ExtensionContext;

  const mockExistingPathsWithGlobalConfig: IExistingPaths = {
    individualizedExtensionPaths: [{extensionId: 'alternative.extension', path: 'foo'}],
    sharedExistingPath: undefined
  }

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
  }`;

  this.beforeAll(async () => {
    extensionContext = {
      subscriptions: [],
      globalStoragePath: storagePath,
      globalState: mockState,
      extensionPath,
      logPath,
    } as any;

    process.env.DOTNET_INSTALL_TOOL_UNDER_TEST = 'true';
    extension.ReEnableActivationForManualActivation();
    extension.activate(extensionContext, {
      telemetryReporter: new MockTelemetryReporter(),
      extensionConfiguration: new MockExtensionConfiguration(mockExistingPathsWithGlobalConfig.individualizedExtensionPaths!, true, mockExistingPathsWithGlobalConfig.sharedExistingPath!),
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

  async function installRuntime(dotnetVersion : string, mode : DotnetInstallMode)
  {
    const context: IDotnetAcquireContext = { version: dotnetVersion, requestingExtensionId, mode: mode };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result, 'Command results a result');
    assert.exists(result!.dotnetPath, 'The return type of the local runtime install command has a .dotnetPath property');
    assert.isTrue(fs.existsSync(result!.dotnetPath), 'The returned path of .net does exist');
    assert.include(result!.dotnetPath, '.dotnet', '.dotnet is in the path of the local runtime install');
    assert.include(result!.dotnetPath, context.version, 'the path of the local runtime install includes the version of the runtime requested');
  }

  test('Install Local Runtime Command', async () =>
  {
    await installRuntime('2.2', 'runtime');
  }).timeout(standardTimeoutTime);

  test('Install Local ASP.NET Runtime Command', async () =>
  {
    await installRuntime('2.2', 'aspnetcore');
  }).timeout(standardTimeoutTime);

  async function installUninstallAll(dotnetVersion : string, mode : DotnetInstallMode)
  {
    const context: IDotnetAcquireContext = { version: dotnetVersion, requestingExtensionId, mode: mode };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.isTrue(fs.existsSync(result!.dotnetPath!));
    assert.include(result!.dotnetPath, context.version);
    await vscode.commands.executeCommand<string>('dotnet.uninstallAll', context.version);
    assert.isFalse(fs.existsSync(result!.dotnetPath), 'the dotnet path result does not exist after uninstall');
  }

  test('Uninstall Local Runtime Command', async () => {
    await installUninstallAll('2.2', 'runtime')
  }).timeout(standardTimeoutTime);

  test('Uninstall Local ASP.NET Runtime Command', async () => {
    await installUninstallAll('2.2', 'aspnetcore')
  }).timeout(standardTimeoutTime);

  async function installMultipleVersions(versions : string[], installMode : DotnetInstallMode)
  {
    let dotnetPaths: string[] = [];
    for (const version of versions) {
      const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', { version, requestingExtensionId, mode: installMode });
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
  }

  test('Install and Uninstall Multiple Local Runtime Versions', async () => {
    await installMultipleVersions(['2.2', '3.0', '3.1'], 'runtime');
  }).timeout(standardTimeoutTime * 2);

  test('Install and Uninstall Multiple Local ASP.NET Runtime Versions', async () => {
    await installMultipleVersions(['2.2', '3.0', '3.1'], 'aspnetcore');
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
    const installKey = getInstallKeyCustomArchitecture(fullyResolvedVersion, os.arch(), 'runtime', 'local');

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
    assert.exists(result, 'A result from the API exists');
    assert.exists(result!.dotnetPath, 'The result has a dotnet path');
    assert.include(result!.dotnetPath, context.version, 'The version is included in the path');
    assert.include(mockDisplayWorker.warningMessage, 'Ignoring existing .NET paths');
  }).timeout(standardTimeoutTime);

  test('Install Local Runtime Command With Path Config Defined', async () => {
    const context: IDotnetAcquireContext = { version: '0.1', requestingExtensionId: 'alternative.extension' };
    const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
    assert.exists(result);
    assert.exists(result!.dotnetPath);
    assert.equal(result!.dotnetPath, 'foo');
  }).timeout(standardTimeoutTime);

  test('List Sdks & Runtimes', async () => {
    const mockAcquisitionContext = getMockAcquisitionContext('sdk', '');
    const webWorker = new MockWebRequestWorker(mockAcquisitionContext, '');
    webWorker.response = JSON.parse(mockReleasesData);

    // The API can find the available SDKs and list their versions.
    const apiContext: IDotnetListVersionsContext = { listRuntimes: false };
    const result = await vscode.commands.executeCommand<IDotnetListVersionsResult>('dotnet.listVersions', apiContext, webWorker);
    assert.exists(result);
    assert.equal(result?.length, 2, `It can find both versions of the SDKs. Found: ${result}`);
    assert.equal(result?.filter((sdk : any) => sdk.version === '7.0.202').length, 1, 'The mock SDK with the expected version {7.0.200} was not found by the API parsing service.');
    assert.equal(result?.filter((sdk : any) => sdk.channelVersion === '7.0').length, 1, 'The mock SDK with the expected channel version {7.0} was not found by the API parsing service.');
    assert.equal(result?.filter((sdk : any) => sdk.supportPhase === 'active').length, 1, 'The mock SDK with the expected support phase of {active} was not found by the API parsing service.');

    // The API can find the available runtimes and their versions.
    apiContext.listRuntimes = true;
    const runtimeResult = await vscode.commands.executeCommand<IDotnetListVersionsResult>('dotnet.listVersions', apiContext, webWorker);
    assert.exists(runtimeResult);
    assert.equal(runtimeResult?.length, 2,  `It can find both versions of the runtime. Found: ${result}`);
    assert.equal(runtimeResult?.filter((runtime : any) => runtime.version === '7.0.4').length, 1, 'The mock Runtime with the expected version was not found by the API parsing service.');
  }).timeout(standardTimeoutTime);

  test('Get Recommended SDK Version', async () => {
    const mockAcquisitionContext = getMockAcquisitionContext('sdk', '');
    const webWorker = new MockWebRequestWorker(mockAcquisitionContext, '');
    webWorker.response = JSON.parse(mockReleasesData);

    const result = await vscode.commands.executeCommand<IDotnetListVersionsResult>('dotnet.recommendedVersion', null, webWorker);
    assert.exists(result);
    if(os.platform() !== 'linux')
    {
      assert.equal(result[0].version, '7.0.202', 'The SDK did not recommend the version it was supposed to, which should be {7.0.200} from the mock data.');
    }
    else
    {
      assert.equal(result[0].version, '8.0.1xx', 'The SDK did not recommend the version it was supposed to, which should be N.0.1xx based on surface level distro knowledge. If a new version is available, this test may need to be updated to the newest version.');

    }
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
