/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { warn } from 'console';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as rimraf from 'rimraf';
import { promisify } from 'util';
import * as vscode from 'vscode';
import
{
    DotnetInstallMode,
    DotnetInstallType,
    DotnetVersionSpecRequirement,
    EnvironmentVariableIsDefined,
    FileUtilities,
    IDotnetAcquireContext,
    IDotnetAcquireResult,
    IDotnetFindPathContext,
    IDotnetListVersionsContext,
    IDotnetListVersionsResult,
    IExistingPaths,
    ITelemetryEvent,
    LocalMemoryCacheSingleton,
    MockEnvironmentVariableCollection,
    MockExtensionConfiguration,
    MockExtensionContext,
    MockTelemetryReporter,
    MockWebRequestWorker,
    MockWindowDisplayWorker,
    getDistroInfo,
    getDotnetExecutable,
    getInstallIdCustomArchitecture,
    getLinuxSupportedDotnetSDKVersion,
    getMajorMinor,
    getMockAcquisitionContext,
    getMockAcquisitionWorkerContext,
    getMockUtilityContext,
    getPathSeparator
} from 'vscode-dotnet-runtime-library';
import * as extension from '../../extension';

const assert: any = chai.assert;
const standardTimeoutTime = 40000;
const originalPATH = process.env.PATH;

suite('DotnetCoreAcquisitionExtension End to End', function ()
{
    this.retries(1);
    const storagePath = path.join(__dirname, 'tmp');
    const mockState = new MockExtensionContext();
    const extensionPath = path.join(__dirname, '/../../..');
    const logPath = path.join(__dirname, 'logs');
    const requestingExtensionId = 'fake.extension';
    const mockDisplayWorker = new MockWindowDisplayWorker();
    let extensionContext: vscode.ExtensionContext;
    const environmentVariableCollection = new MockEnvironmentVariableCollection();

    const existingPathVersionToFake = '5.0.1~x64'
    const pathWithIncorrectVersionForTest = path.join(__dirname, `/.dotnet/${existingPathVersionToFake}/${getDotnetExecutable()}`);

    const mockExistingPathsWithGlobalConfig: IExistingPaths = {
        individualizedExtensionPaths: [{ extensionId: 'alternative.extension', path: pathWithIncorrectVersionForTest }],
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

    this.beforeAll(async () =>
    {
        extensionContext = {
            subscriptions: [],
            globalStoragePath: storagePath,
            globalState: mockState,
            extensionPath,
            logPath,
            environmentVariableCollection
        } as any;

        process.env.DOTNET_INSTALL_TOOL_UNDER_TEST = 'true';
        extension.ReEnableActivationForManualActivation();
        extension.activate(extensionContext, {
            telemetryReporter: new MockTelemetryReporter(),
            extensionConfiguration: new MockExtensionConfiguration(mockExistingPathsWithGlobalConfig.individualizedExtensionPaths!, true, mockExistingPathsWithGlobalConfig.sharedExistingPath!),
            displayWorker: mockDisplayWorker,
        });
    });

    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        process.env.PATH = originalPATH;
        LocalMemoryCacheSingleton.getInstance().invalidate();

        await vscode.commands.executeCommand<string>('dotnet.uninstallAll');
        mockState.clear();
        MockTelemetryReporter.telemetryEvents = [];
        await new FileUtilities().wipeDirectory(storagePath);
        // Do not want cached results from prior tests to interfere
        LocalMemoryCacheSingleton.getInstance().invalidate();
    }).timeout(standardTimeoutTime);

    test('Activate', async () =>
    {
        // Commands should now be registered
        assert.exists(extensionContext);
        assert.isAbove(extensionContext.subscriptions.length, 0);
    }).timeout(standardTimeoutTime);

    async function installRuntime(dotnetVersion: string, installMode: DotnetInstallMode, arch?: string)
    {
        let context: IDotnetAcquireContext = { version: dotnetVersion, requestingExtensionId, mode: installMode };
        if (arch)
        {
            context.architecture = arch;
        }
        const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
        assert.exists(result, 'Command results a result');
        assert.exists(result!.dotnetPath, 'The return type of the local runtime install command has a .dotnetPath property');
        assert.isTrue(fs.existsSync(result!.dotnetPath), 'The returned path of .net does exist');
        assert.include(result!.dotnetPath, '.dotnet', '.dotnet is in the path of the local runtime install');
        assert.include(result!.dotnetPath, context.version, 'the path of the local runtime install includes the version of the runtime requested');
        return result.dotnetPath ?? 'runtimePathNotFound';
    }


    async function installMultipleVersions(versions: string[], installMode: DotnetInstallMode)
    {
        let dotnetPaths: string[] = [];
        for (const version of versions)
        {
            const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', { version, requestingExtensionId, mode: installMode });
            assert.exists(result, 'acquire command returned a result/success');
            assert.exists(result!.dotnetPath, 'the result has a path');
            assert.include(result!.dotnetPath, version, 'the path includes the version');
            if (result!.dotnetPath)
            {
                dotnetPaths = dotnetPaths.concat(result!.dotnetPath);
            }
        }
        // All versions are still there after all installs are completed
        for (const dotnetPath of dotnetPaths)
        {
            assert.isTrue(fs.existsSync(dotnetPath));
        }
    }

    async function installUninstallOne(dotnetVersion: string, versionToKeep: string, installMode: DotnetInstallMode, type: DotnetInstallType)
    {
        const context: IDotnetAcquireContext = { version: dotnetVersion, requestingExtensionId, mode: installMode, installType: type };
        const contextToKeep: IDotnetAcquireContext = { version: versionToKeep, requestingExtensionId, mode: installMode, installType: type };

        const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
        const resultToKeep = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', contextToKeep);
        assert.exists(result?.dotnetPath, 'The install succeeds and returns a path');
        assert.exists(resultToKeep?.dotnetPath, 'The 2nd install succeeds and returns a path');

        const uninstallResult = await vscode.commands.executeCommand<string>('dotnet.uninstall', context);
        assert.equal(uninstallResult, '0', 'Uninstall returns 0');
        assert.isFalse(fs.existsSync(result!.dotnetPath), 'the dotnet path result does not exist after uninstall');
        assert.isTrue(fs.existsSync(resultToKeep!.dotnetPath), 'Only one thing is uninstalled.');
    }

    async function installUninstallAll(dotnetVersion: string, installMode: DotnetInstallMode)
    {
        const context: IDotnetAcquireContext = { version: dotnetVersion, requestingExtensionId, mode: installMode };
        const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
        assert.exists(result);
        assert.exists(result!.dotnetPath);
        assert.isTrue(fs.existsSync(result!.dotnetPath!));
        assert.include(result!.dotnetPath, context.version);
        await vscode.commands.executeCommand<string>('dotnet.uninstallAll', context.version);
        assert.isFalse(fs.existsSync(result!.dotnetPath), 'the dotnet path result does not exist after uninstall');
    }

    async function uninstallWithMultipleOwners(dotnetVersion: string, installMode: DotnetInstallMode, type: DotnetInstallType)
    {
        const context: IDotnetAcquireContext = { version: dotnetVersion, requestingExtensionId, mode: installMode, installType: type };
        const contextFromOtherId: IDotnetAcquireContext = { version: dotnetVersion, requestingExtensionId: 'fake.extension.two', mode: installMode, installType: type };

        const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
        const resultToKeep = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', contextFromOtherId);
        assert.exists(result?.dotnetPath, 'The install succeeds and returns a path');
        assert.equal(result?.dotnetPath, resultToKeep?.dotnetPath, 'The two dupe installs use the same path');

        const uninstallResult = await vscode.commands.executeCommand<string>('dotnet.uninstall', context);
        assert.equal(uninstallResult, '0', '1st owner Uninstall returns 0');
        assert.isTrue(fs.existsSync(resultToKeep!.dotnetPath), 'Nothing is uninstalled without FORCE if theres multiple owners.');

        const finalUninstallResult = await vscode.commands.executeCommand<string>('dotnet.uninstall', contextFromOtherId);
        assert.equal(finalUninstallResult, '0', '2nd owner Uninstall returns 0');
        assert.isFalse(fs.existsSync(result!.dotnetPath), 'the dotnet path result does not exist after uninstalling from all owners');
    }

    function includesPathWithLikelyDotnet(pathToCheck: string): boolean
    {
        const lowerPath = pathToCheck.toLowerCase();
        return lowerPath.includes('dotnet') || lowerPath.includes('program') || lowerPath.includes('share') || lowerPath.includes('bin') || lowerPath.includes('snap') || lowerPath.includes('homebrew');
    }

    async function findPathWithRequirementAndInstall(version: string, iMode: DotnetInstallMode, arch: string, condition: DotnetVersionSpecRequirement, shouldFind: boolean, contextToLookFor?: IDotnetAcquireContext, setPath = true,
        blockNoArch = false, dontCheckNonPaths = true)
    {
        const installPath = await installRuntime(version, iMode, arch);

        // use path.dirname : the dotnet.exe cant be on the PATH
        if (setPath)
        {
            process.env.PATH = `${path.dirname(installPath)}${getPathSeparator()}${process.env.PATH?.split(getPathSeparator()).filter((x: string) => !(includesPathWithLikelyDotnet(x))).join(getPathSeparator())}`;
        }
        else
        {
            // remove dotnet so the test will work on machines with dotnet installed
            process.env.PATH = `${process.env.PATH?.split(getPathSeparator()).filter((x: string) => !(includesPathWithLikelyDotnet(x))).join(getPathSeparator())}`;
            process.env.DOTNET_ROOT = path.dirname(installPath);
        }

        extensionContext.environmentVariableCollection.replace('PATH', process.env.PATH ?? '');

        if (blockNoArch)
        {
            extensionContext.environmentVariableCollection.replace('DOTNET_INSTALL_TOOL_DONT_ACCEPT_UNKNOWN_ARCH', '1');
            process.env.DOTNET_INSTALL_TOOL_DONT_ACCEPT_UNKNOWN_ARCH = '1';
        }

        if (dontCheckNonPaths)
        {
            process.env.DOTNET_INSTALL_TOOL_SKIP_HOSTFXR = 'true';
        }

        const result: IDotnetAcquireResult = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.findPath',
            {
                acquireContext: contextToLookFor ?? { version, requestingExtensionId: requestingExtensionId, mode: iMode, architecture: arch } as IDotnetAcquireContext,
                versionSpecRequirement: condition
            } as IDotnetFindPathContext
        );

        extensionContext.environmentVariableCollection.replace('DOTNET_INSTALL_TOOL_DONT_ACCEPT_UNKNOWN_ARCH', '0');
        process.env.DOTNET_INSTALL_TOOL_DONT_ACCEPT_UNKNOWN_ARCH = '0';
        process.env.DOTNET_INSTALL_TOOL_SKIP_HOSTFXR = '0';

        if (shouldFind)
        {
            assert.exists(result.dotnetPath, 'find path command returned a result');
            assert.equal(result.dotnetPath.toLowerCase(), installPath.toLowerCase(), 'The path returned by findPath is correct');
        }
        else
        {
            assert.equal(result?.dotnetPath, undefined, 'find path command returned no undefined if no path matches condition');
        }
    }

    test('Install Local Runtime Command', async () =>
    {
        await installRuntime('2.2', 'runtime');
    }).timeout(standardTimeoutTime);

    test('Install Local ASP.NET Runtime Command', async () =>
    {
        await installRuntime('7.0', 'aspnetcore');
    }).timeout(standardTimeoutTime);

    test('Uninstall One Local Runtime Command', async () =>
    {
        await installUninstallOne('2.2', '7.0', 'runtime', 'local');
    }).timeout(standardTimeoutTime);

    test('Uninstall One Local ASP.NET Runtime Command', async () =>
    {
        await installUninstallOne('2.2', '6.0', 'aspnetcore', 'local');
    }).timeout(standardTimeoutTime);

    test('Uninstall All Local Runtime Command', async () =>
    {
        await installUninstallAll('2.2', 'runtime')
    }).timeout(standardTimeoutTime);

    test('Uninstall All Local ASP.NET Runtime Command', async () =>
    {
        await installUninstallAll('2.2', 'aspnetcore')
    }).timeout(standardTimeoutTime);

    test('Uninstall Runtime Only Once No Owners Exist', async () =>
    {
        await uninstallWithMultipleOwners('8.0', 'runtime', 'local');
    }).timeout(standardTimeoutTime);

    test('Uninstall ASP.NET Runtime Only Once No Owners Exist', async () =>
    {
        await uninstallWithMultipleOwners('8.0', 'aspnetcore', 'local');
    }).timeout(standardTimeoutTime);

    test('Install and Uninstall Multiple Local Runtime Versions', async () =>
    {
        await installMultipleVersions(['2.2', '3.0', '3.1'], 'runtime');
    }).timeout(standardTimeoutTime * 2);

    test('Install and Uninstall Multiple Local ASP.NET Runtime Versions', async () =>
    {
        await installMultipleVersions(['2.2', '3.0', '3.1'], 'aspnetcore');
    }).timeout(standardTimeoutTime * 2);

    test('Works With Prior Incomplete or Corrupted Install', async () =>
    {
        const installPath = await installRuntime('9.0', 'runtime');
        assert.isTrue(fs.existsSync(installPath), 'The path exists after install');
        // remove the install executable but not the folder to simulate a corrupt install
        rimraf.sync(installPath);
        assert.isFalse(fs.existsSync(installPath), 'The path does not exist after uninstall');
        // try to acquire again, and it should succeed
        const _ = await installRuntime('9.0', 'runtime');
    }).timeout(standardTimeoutTime);

    test('It works if the install exists', async () =>
    {
        const installPath = await installRuntime('9.0', 'runtime');
        const samePath = await installRuntime('9.0', 'runtime');
    }).timeout(standardTimeoutTime);

    test('Find dotnet PATH Command Met Condition', async () =>
    {
        // install 5.0 then look for 5.0 path
        await findPathWithRequirementAndInstall('5.0', 'runtime', os.arch(), 'greater_than_or_equal', true);
    }).timeout(standardTimeoutTime);

    test('Find dotnet PATH Command Met ROOT Condition', async () =>
    {
        // install 7.0, set dotnet_root and not path, then look for root
        const oldROOT = process.env.DOTNET_ROOT;

        await findPathWithRequirementAndInstall('7.0', 'runtime', os.arch(), 'equal', true,
            { version: '7.0', mode: 'runtime', architecture: os.arch(), requestingExtensionId: requestingExtensionId }, false
        );

        if (EnvironmentVariableIsDefined(oldROOT))
        {
            process.env.DOTNET_ROOT = oldROOT;
        }
        else
        {
            delete process.env.DOTNET_ROOT;
        }
    }).timeout(standardTimeoutTime);

    test('Find dotnet PATH Command Met Version Condition', async () =>
    {
        // Install 8.0, look for 3.1 with accepting dotnet gr than or eq to 3.1

        await findPathWithRequirementAndInstall('8.0', 'runtime', os.arch(), 'greater_than_or_equal', true,
            { version: '3.1', mode: 'runtime', architecture: os.arch(), requestingExtensionId: requestingExtensionId }
        );
    }).timeout(standardTimeoutTime);

    test('Find dotnet PATH Command Met Version Condition with Double Digit Major', async () =>
    {
        await findPathWithRequirementAndInstall('9.0', 'runtime', os.arch(), 'less_than_or_equal', true,
            { version: '11.0', mode: 'runtime', architecture: os.arch(), requestingExtensionId: requestingExtensionId }
        );
    }).timeout(standardTimeoutTime);


    test('Find dotnet PATH Command Unmet Version Condition', async () =>
    {
        // Install 9.0, look for 90.0 which is not equal to 9.0
        await findPathWithRequirementAndInstall('9.0', 'runtime', os.arch(), 'equal', false,
            { version: '90.0', mode: 'runtime', architecture: os.arch(), requestingExtensionId: requestingExtensionId }
        );
    }).timeout(standardTimeoutTime);

    test('Find dotnet PATH Command Unmet Mode Condition', async () =>
    {
        // look for 3.1 runtime but install 3.1 aspnetcore
        await findPathWithRequirementAndInstall('3.1', 'runtime', os.arch(), 'equal', false,
            { version: '3.1', mode: 'aspnetcore', architecture: os.arch(), requestingExtensionId: requestingExtensionId }
        );
    }).timeout(standardTimeoutTime);

    test('Find dotnet PATH Command Unmet Arch Condition', async () =>
    {
        // look for a different architecture of 3.1
        if (os.platform() !== 'darwin')
        {
            // The CI Machines are running on ARM64 for OS X.
            // They also have an x64 HOST. We can't set DOTNET_MULTILEVEL_LOOKUP to 0 because it will break the ability to find the host on --info
            // As a 3.1 runtime host does not provide the architecture, but we try to use 3.1 because CI machines won't have it.
            //
            await findPathWithRequirementAndInstall('3.1', 'runtime', os.arch() == 'arm64' ? 'x64' : os.arch(), 'greater_than_or_equal', false,
                { version: '3.1', mode: 'runtime', architecture: 'arm64', requestingExtensionId: requestingExtensionId }, true, true
            );
        }
    }).timeout(standardTimeoutTime);

    test('Find dotnet PATH Command Unmet Arch Condition With Host that prints Arch', async () =>
    {
        if (os.platform() !== 'darwin')
        {
            await findPathWithRequirementAndInstall('9.0', 'runtime', os.arch() == 'arm64' ? 'x64' : os.arch(), 'greater_than_or_equal', false,
                { version: '9.0', mode: 'runtime', architecture: 'arm64', requestingExtensionId: requestingExtensionId }
            );
        }
    }).timeout(standardTimeoutTime);


    test('Find dotnet PATH Command No Arch Available But Accept By Default', async () =>
    {
        // look for a different architecture of 3.1
        if (os.platform() !== 'darwin')
        {
            await findPathWithRequirementAndInstall('3.1', 'runtime', os.arch() == 'arm64' ? 'x64' : os.arch(), 'greater_than_or_equal', true,
                { version: '3.1', mode: 'runtime', architecture: 'arm64', requestingExtensionId: requestingExtensionId }
            );
        }
    }).timeout(standardTimeoutTime);

    test('Find dotnet PATH Command Unmet Runtime Patch Condition', async () =>
    {
        // Install 8.0.{LATEST, which will be < 99}, look for 8.0.99 with accepting dotnet gr than or eq to 8.0.99
        // No tests for SDK since that's harder to replicate with a global install and different machine states
        if (os.platform() !== 'darwin')
        {
            await findPathWithRequirementAndInstall('8.0', 'runtime', os.arch(), 'greater_than_or_equal', false,
                { version: '8.0.99', mode: 'runtime', architecture: os.arch(), requestingExtensionId: requestingExtensionId }
            );
        }
    }).timeout(standardTimeoutTime);

    test('Find dotnet PATH Command does not work with extension-managed runtime installations', async () =>
    {
        // First install a runtime that we'll try to find
        const version = '7.0';
        const runtimePath = await installRuntime(version, 'runtime', os.arch());
        assert.exists(runtimePath, 'Runtime should be installed successfully');

        const originalPath = process.env.PATH;
        try
        {
            // Filter PATH to remove any existing dotnet installations
            process.env.PATH = process.env.PATH?.split(getPathSeparator())
                .filter((x: string) => !(includesPathWithLikelyDotnet(x)))
                .join(getPathSeparator());

            const findPathContext: IDotnetFindPathContext = {
                acquireContext: {
                    version,
                    requestingExtensionId,
                    mode: 'runtime',
                    architecture: os.arch()
                },
                versionSpecRequirement: 'latestPatch'
            };

            // Then verify we can find the extension-managed runtime
            const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.findPath', findPathContext);
            assert.notExists(result, 'Should find a runtime');
        }
        finally
        {
            process.env.PATH = originalPath;
        }
    }).timeout(standardTimeoutTime);

    test('Install SDK Globally E2E (Requires Admin)', async () =>
    {
        // We only test if the process is running under ADMIN because non-admin requires user-intervention.
        const sdkVersion = '7.0.103';
        const context: IDotnetAcquireContext = { version: sdkVersion, requestingExtensionId: 'sample-extension', installType: 'global' };
        if (await new FileUtilities().isElevated(getMockAcquisitionWorkerContext(context), getMockUtilityContext()))
        {
            const originalPath = process.env.PATH;

            // We cannot use the describe pattern to restore the environment variables using vscode's extension testing infrastructure.
            // So we must set and unset it ourselves, which isn't ideal as this variable could remain.
            let result: IDotnetAcquireResult;
            let error: any;
            let pathAfterInstall;

            // We cannot test much as we don't want to leave global installs on dev boxes. But we do want to make sure the e-2-e goes through the right path. Vendors can test the rest.
            // So we have this environment variable that tells us to stop before running any real install.
            process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH = 'true';
            try
            {
                result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquireGlobalSDK', context);
            }
            catch (err)
            {
                error = err;
            }
            finally
            {
                pathAfterInstall = process.env.PATH;
                process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH = undefined;
                process.env.PATH = originalPath;

                if (error)
                {
                    throw (new Error(`The test failed to run the acquire command successfully. Error: ${error}`));
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
    }).timeout(standardTimeoutTime * 1000);

    test('Telemetry Sent During Install and Uninstall', async () =>
    {
        if (!vscode.env.isTelemetryEnabled)
        {
            console.warn('The telemetry test cannot run as VS Code Telemetry is disabled in user settings.');
            return;
        }

        const rntVersion = '2.2';
        const fullyResolvedVersion = '2.2.8'; // 2.2 is very much out of support, so we don't expect this to change to a newer version
        const installId = getInstallIdCustomArchitecture(fullyResolvedVersion, os.arch(), 'runtime', 'local');

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
        assert.include(startedEvent!.properties!.AcquisitionInstallId, installId, 'Acquisition started event has a install key');

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
        const errors = MockTelemetryReporter.telemetryEvents.filter((event: ITelemetryEvent) => event.eventName.includes('Error') && event.eventName !== 'CommandExecutionStdError');
        assert.isEmpty(errors, `No error events were reported in telemetry reporting. ${JSON.stringify(errors)}`);
    }).timeout(standardTimeoutTime);

    test('Telemetry Sent on Error', async () =>
    {
        if (!vscode.env.isTelemetryEnabled)
        {
            console.warn('The telemetry test cannot run as VS Code Telemetry is disabled in user settings.');
            return;
        }

        const context: IDotnetAcquireContext = { version: 'foo', requestingExtensionId };
        try
        {
            await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
            assert.isTrue(false); // An error should have been thrown
        } catch (error)
        {
            const versionError = MockTelemetryReporter.telemetryEvents.find((event: ITelemetryEvent) => event.eventName === '[ERROR]:DotnetVersionResolutionError');
            assert.exists(versionError, 'The version resolution error appears in telemetry');
        }
    }).timeout(standardTimeoutTime / 2);

    test('Install Local Runtime Command Passes With Warning With No RequestingExtensionId', async () =>
    {
        const context: IDotnetAcquireContext = { version: '3.1' };
        const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
        assert.exists(result, 'A result from the API exists');
        assert.exists(result!.dotnetPath, 'The result has a dotnet path');
        assert.include(result!.dotnetPath, context.version, 'The version is included in the path');
        assert.include(mockDisplayWorker.warningMessage, 'Ignoring existing .NET paths');
    }).timeout(standardTimeoutTime);

    test('Install Local Runtime Command With Path Settings', async () =>
    {
        let clearedFolder = false;
        if (fs.existsSync(path.dirname(pathWithIncorrectVersionForTest)))
        {
            // Delete the test folder so it doesn't exist from any old test run
            fs.rmSync(path.dirname(pathWithIncorrectVersionForTest), { recursive: true, force: true });
            clearedFolder = true;
        }
        assert.isEmpty(fs.existsSync(path.dirname(pathWithIncorrectVersionForTest)) ? fs.readdirSync(path.dirname(pathWithIncorrectVersionForTest)) : [], `Test setup: cleared folder ${clearedFolder}?
the fake dotnet path setting is an empty dir -- if it is not empty, test cleanup must not work properly.`);

        // acquire with the alternative extension id which has a path setting set to the fake path
        // If the setting is bad then it should also acquire somewhere else.
        const context: IDotnetAcquireContext = { version: '5.0', requestingExtensionId: 'alternative.extension', architecture: os.platform() };

        const resultForAcquiringPathSettingRuntime = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);
        assert.exists(resultForAcquiringPathSettingRuntime!.dotnetPath, 'Basic acquire works');

        // The runtime setting on the path needs to be a match for a runtime but also a different folder name
        // so that we can tell the setting was used. We cant tell it to install an older  besides latest,
        // but we can rename the folder then re-acquire for latest and see that it uses the existing 'older' runtime path
        assert.notEqual(path.dirname(resultForAcquiringPathSettingRuntime.dotnetPath), path.dirname(pathWithIncorrectVersionForTest), `Test setup: path setting is different from the path acquire chose when the setting is enabled but nothing exists there.
File system at ${pathWithIncorrectVersionForTest}: ${fs.existsSync(path.dirname(pathWithIncorrectVersionForTest)) ?
                fs.readdirSync(path.dirname(pathWithIncorrectVersionForTest)) : 'empty'}.
Paths: 'acquire returned: ${resultForAcquiringPathSettingRuntime.dotnetPath} while the fake setting is ${pathWithIncorrectVersionForTest}`);

        // Copy the real install to the fake install directory with a differnt version
        fs.cpSync(path.dirname(resultForAcquiringPathSettingRuntime.dotnetPath), path.dirname(pathWithIncorrectVersionForTest), { recursive: true });
        assert.isTrue(fs.existsSync(path.dirname(pathWithIncorrectVersionForTest)), 'The copy of the real dotnet to the new wrong-versioned path succeeded');

        // Delete the actual install that was done so it looks like it was correctly installed to the fake location
        fs.rmSync(resultForAcquiringPathSettingRuntime.dotnetPath, { recursive: true, force: true });
        assert.isTrue(!fs.existsSync(resultForAcquiringPathSettingRuntime.dotnetPath), 'The deletion of the acquired install path succeeded');
        assert.isTrue(fs.existsSync(path.dirname(pathWithIncorrectVersionForTest)), 'The copy of the real dotnet to the new wrong-versioned path was not deleted');

        // Call Acquire on the alternative extension to cause it to return the path setting
        LocalMemoryCacheSingleton.getInstance().invalidate();
        const result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', context);

        assert.exists(result, 'returns a result with path setting');
        assert.exists(result!.dotnetPath, 'path setting has a path in its object');
        assert.equal(result!.dotnetPath, pathWithIncorrectVersionForTest, 'path setting is used'); // this is set for the alternative.extension in the settings

        // check that find path uses the setting
        LocalMemoryCacheSingleton.getInstance().invalidate();
        const findPath = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.findPath', { acquireContext: Object.assign({}, context, { mode: 'runtime' }), versionSpecRequirement: 'equal' });
        assert.equal(findPath!.dotnetPath, pathWithIncorrectVersionForTest, 'findPath uses vscode setting for runtime'); // this is set for the alternative.extension in the settings

        // check that find path does not use the setting even if its set because it should not use the wrong thing that does not meet the condition
        const findSDKPath = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.findPath', { acquireContext: Object.assign({}, context, { mode: 'sdk' }), versionSpecRequirement: 'equal' });
        assert.equal(findSDKPath?.dotnetPath ?? undefined, undefined, 'findPath does not find path setting for the SDK');
    }).timeout(standardTimeoutTime * 3);

    test('List Sdks & Runtimes', async () =>
    {
        const mockAcquisitionContext = getMockAcquisitionContext('sdk', '');
        const webWorker = new MockWebRequestWorker();
        webWorker.response = JSON.parse(mockReleasesData);

        // The API can find the available SDKs and list their versions.
        const apiContext: IDotnetListVersionsContext = { listRuntimes: false };
        const result = await vscode.commands.executeCommand<IDotnetListVersionsResult>('dotnet.listVersions', apiContext, webWorker);
        assert.exists(result);
        assert.equal(result?.length, 2, `It can find both versions of the SDKs. Found: ${result}`);
        assert.equal(result?.filter((sdk: any) => sdk.version === '7.0.202').length, 1, 'The mock SDK with the expected version {7.0.200} was not found by the API parsing service.');
        assert.equal(result?.filter((sdk: any) => sdk.channelVersion === '7.0').length, 1, 'The mock SDK with the expected channel version {7.0} was not found by the API parsing service.');
        assert.equal(result?.filter((sdk: any) => sdk.supportPhase === 'active').length, 1, 'The mock SDK with the expected support phase of {active} was not found by the API parsing service.');

        // The API can find the available runtimes and their versions.
        apiContext.listRuntimes = true;
        const runtimeResult = await vscode.commands.executeCommand<IDotnetListVersionsResult>('dotnet.listVersions', apiContext, webWorker);
        assert.exists(runtimeResult);
        assert.equal(runtimeResult?.length, 2, `It can find both versions of the runtime. Found: ${result}`);
        assert.equal(runtimeResult?.filter((runtime: any) => runtime.version === '7.0.4').length, 1, 'The mock Runtime with the expected version was not found by the API parsing service.');
    }).timeout(standardTimeoutTime);

    test('Get Recommended SDK Version', async () =>
    {
        const mockAcquisitionContext = getMockAcquisitionContext('sdk', '');
        const webWorker = new MockWebRequestWorker();
        webWorker.response = JSON.parse(mockReleasesData);

        const result = await vscode.commands.executeCommand<IDotnetListVersionsResult>('dotnet.recommendedVersion', { listRuntimes: false } as IDotnetListVersionsContext, webWorker);
        assert.exists(result);
        assert.exists(result[0]);
        if (os.platform() !== 'linux')
        {
            assert.equal(result[0].version, '7.0.202', 'The SDK did not recommend the version it was supposed to, which should be {7.0.200} from the mock data.');
        }
        else
        {
            const recLinuxVersionFull = getMajorMinor(await getLinuxSupportedDotnetSDKVersion(mockAcquisitionContext), mockAcquisitionContext.eventStream, mockAcquisitionContext)
            assert.equal(result[0].version, `${recLinuxVersionFull}.1xx`, `The SDK did not recommend the version (it said ${result[0].version}) it was supposed to, which should be N.0.1xx based on surface level distro knowledge, version ${JSON.stringify(await getDistroInfo(mockAcquisitionContext))}. If a new version is available, this test may need to be updated to the newest version.`);
        }
    }).timeout(standardTimeoutTime);

    async function testAcquire(installMode: DotnetInstallMode)
    {
        // Runtime is not yet installed
        const context: IDotnetAcquireContext = { version: '3.1', requestingExtensionId, mode: installMode };
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
        await promisify(rimraf)(result!.dotnetPath!);
    }

    test('Install Runtime Status Command', async () =>
    {
        await testAcquire('runtime');
    }).timeout(standardTimeoutTime);

    test('Install Aspnet runtime Status Command', async () =>
    {
        await testAcquire('aspnetcore');
    }).timeout(standardTimeoutTime);

    test('acquireStatus does respect Mode', async () =>
    {
        const runtimeContext: IDotnetAcquireContext = { version: '5.0', requestingExtensionId, mode: 'runtime' };
        const aspNetContext: IDotnetAcquireContext = { version: '5.0', requestingExtensionId, mode: 'aspnetcore' };

        let result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquireStatus', runtimeContext);
        assert.notExists(result);
        result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquireStatus', aspNetContext);
        assert.notExists(result);

        result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquire', runtimeContext);
        assert.exists(result);

        result = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.acquireStatus', aspNetContext);
        assert.equal(undefined, result, 'Acquire Status for no ASP.NET installed when Runtime is installed should not mistake Runtime Install as ASP.NET Install');
    }).timeout(standardTimeoutTime);

    test('resetData command wipes install', async () =>
    {
        const dotnetPathRes = await installRuntime('9.0', 'runtime');
        const uninstallRes = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.resetData');
        assert.exists(uninstallRes, 'The resetData command should return a result');

        assert.isFalse(fs.existsSync(dotnetPathRes), 'The dotnet path should not exist after resetData command');
        assert.isFalse(fs.existsSync(path.dirname(dotnetPathRes)), 'The dotnet path should not exist after resetData command');
    }).timeout(standardTimeoutTime);

    test('resetData command does not cause invalid state if other extensions use runtime', async () =>
    {
        let dotnetPathRes = await installRuntime('9.0', 'runtime');
        const openFileHandle = await fs.promises.open(dotnetPathRes, fs.constants.O_RDWR);
        try
        {
            const uninstallRes = await vscode.commands.executeCommand<IDotnetAcquireResult>('dotnet.resetData');
            assert.equal(uninstallRes, 0);

            assert.isTrue(fs.existsSync(path.dirname(dotnetPathRes)), 'The dotnet exec should exist after resetData command because it was in use');
            assert.isTrue(fs.existsSync(dotnetPathRes), 'The dotnet folder should exist after resetData command because it was in use');

            // Installing again after reset when prior file in use, should not throw an error
            dotnetPathRes = await installRuntime('9.0', 'runtime');
        }
        finally
        {
            await openFileHandle.close();
        }
    }).timeout(standardTimeoutTime);

    test('Uninstall command does not proceed if dotnet.exe is open', async () =>
    {
        const dotnetPath = await installRuntime('9.0', 'runtime');
        const openFileHandle = await fs.promises.open(dotnetPath, fs.constants.O_RDWR);

        try
        {
            const uninstallResult = await vscode.commands.executeCommand<string>('dotnet.uninstall', { version: '9.0', requestingExtensionId, mode: 'runtime' });
            assert.equal(uninstallResult, '1', 'Uninstall command should return 1 indicating no action was taken');
            assert.isTrue(fs.existsSync(dotnetPath), 'The dotnet.exe file should still exist because it was in use');
        } finally
        {
            await openFileHandle.close();
        }
    }).timeout(standardTimeoutTime);

    test('UninstallAll command does not proceed if dotnet.exe is open', async () =>
    {
        const dotnetPath = await installRuntime('9.0', 'runtime');
        const openFileHandle = await fs.promises.open(dotnetPath, fs.constants.O_RDWR);

        try
        {
            const uninstallAllResult = await vscode.commands.executeCommand<string>('dotnet.uninstallAll');
            assert.equal(uninstallAllResult, '0', 'UninstallAll command should return 0 indicating no action was taken');
            assert.isTrue(fs.existsSync(dotnetPath), 'The dotnet.exe file should still exist because it was in use');
        } finally
        {
            await openFileHandle.close();
        }
    }).timeout(standardTimeoutTime);
});
