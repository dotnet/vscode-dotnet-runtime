/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as os from 'os';
import * as path from 'path';
import { AcquisitionInvoker } from '../../Acquisition/AcquisitionInvoker';
import { DotnetCoreAcquisitionWorker } from '../../Acquisition/DotnetCoreAcquisitionWorker';
import { RuntimeInstallationDirectoryProvider } from '../../Acquisition/RuntimeInstallationDirectoryProvider';
import { SdkInstallationDirectoryProvider } from '../../Acquisition/SdkInstallationDirectoryProvider';
import {
    DotnetAcquisitionAlreadyInstalled,
    DotnetAcquisitionCompleted,
    DotnetAcquisitionStarted,
    DotnetAcquisitionStatusResolved,
    DotnetAcquisitionStatusUndefined,
    DotnetUninstallAllCompleted,
    DotnetUninstallAllStarted,
    TestAcquireCalled,
} from '../../EventStream/EventStreamEvents';
import { EventType } from '../../EventStream/EventType';
import {
    ErrorAcquisitionInvoker,
    MockAcquisitionInvoker,
    MockEventStream,
    MockExtensionContext,
    MockInstallationValidator,
    NoInstallAcquisitionInvoker,
    RejectingAcquisitionInvoker,
} from '../mocks/MockObjects';
const assert = chai.assert;
chai.use(chaiAsPromised);

suite('DotnetCoreAcquisitionWorker Unit Tests', function () {
    const installingVersionsKey = 'installing';
    const installedVersionsKey = 'installed';
    const dotnetFolderName = `.dotnet O'Hare O'Donald`;

    function getTestAcquisitionWorker(runtimeInstall: boolean, arch : string | null | undefined = undefined,
        customEventStream? : MockEventStream , customContext? : MockExtensionContext): [DotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext]
    {
        const context =  customContext ?? new MockExtensionContext();
        const eventStream = customEventStream ?? new MockEventStream();
        const acquisitionWorker = new DotnetCoreAcquisitionWorker({
            storagePath: '',
            extensionState: context,
            eventStream,
            acquisitionInvoker: new NoInstallAcquisitionInvoker(eventStream),
            installationValidator: new MockInstallationValidator(eventStream),
            timeoutValue: 10,
            installDirectoryProvider: runtimeInstall ? new RuntimeInstallationDirectoryProvider('') : new SdkInstallationDirectoryProvider(''),
            installingArchitecture: arch
        });
        return [acquisitionWorker, eventStream, context];
    }

    function getTestApostropheAcquisitionWorker(runtimeInstall: boolean): [DotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext] {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const acquisitionWorker = new DotnetCoreAcquisitionWorker({
            storagePath: '',
            extensionState: context,
            eventStream,
            acquisitionInvoker: new MockAcquisitionInvoker(context, eventStream, 10),
            installationValidator: new MockInstallationValidator(eventStream),
            timeoutValue: 10,
            installDirectoryProvider: runtimeInstall ? new RuntimeInstallationDirectoryProvider('') : new SdkInstallationDirectoryProvider(''),
        });
        return [acquisitionWorker, eventStream, context];
    }

    function getExpectedPath(version: string, isRuntimeInstall: boolean): string {
        return isRuntimeInstall ?
            path.join(dotnetFolderName, version, os.platform() === 'win32' ? 'dotnet.exe' : 'dotnet') :
            path.join(dotnetFolderName, os.platform() === 'win32' ? 'dotnet.exe' : 'dotnet');
    }

    async function assertAcquisitionSucceeded(installKey: string,
        exePath: string,
        eventStream: MockEventStream,
        context: MockExtensionContext,
        isRuntimeInstall = true)
    {
        const expectedPath = getExpectedPath(installKey, isRuntimeInstall);

        // Path to exe should be correct
        assert.equal(exePath, expectedPath, 'The exe path is correct');

        // Should be finished installing
        assert.isEmpty(context.get<string[]>(installingVersionsKey, []), 'There are no versions marked as still installing');
        assert.isNotEmpty(context.get<string[]>(installedVersionsKey, []), 'There is a version marked as installed');
        assert.include(context.get<string[]>(installedVersionsKey, []), installKey, 'The version marked as installed is the expected version');

        //  No errors in event stream
        assert.notExists(eventStream.events.find(event => event.type === EventType.DotnetAcquisitionError));
        const startEvent = eventStream.events
            .find(event => event instanceof DotnetAcquisitionStarted && (event as DotnetAcquisitionStarted).installKey === installKey);
        assert.exists(startEvent, 'The acquisition started event appears');
        const completedEvent = eventStream.events
            .find(event => event instanceof DotnetAcquisitionCompleted && (event as DotnetAcquisitionCompleted).installKey === installKey
                && (event as DotnetAcquisitionCompleted).dotnetPath === expectedPath);
        assert.exists(completedEvent, 'The acquisition completed event appears');

        //  Acquire got called with the correct args
        const acquireEvent = eventStream.events.find(event =>
            event instanceof TestAcquireCalled &&
            ((DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture((event as TestAcquireCalled).context.version, (event as TestAcquireCalled).context.architecture)))
                === installKey) as TestAcquireCalled;
        assert.exists(acquireEvent, 'The acquisition acquire event appears');
        assert.equal(acquireEvent!.context.dotnetPath, expectedPath, 'The acquisition went to the expected dotnetPath');
        assert.equal(acquireEvent!.context.installDir, path.dirname(expectedPath), 'The acquisition went to the expected installation directory');
    }

    this.beforeAll(async () => {
        process.env._VSCODE_DOTNET_INSTALL_FOLDER = dotnetFolderName;
    });

    async function AssertInstallRuntime(acquisitionWorker : DotnetCoreAcquisitionWorker, context : MockExtensionContext, eventStream : MockEventStream, version : string)
    {
        const installKey = acquisitionWorker.getInstallKey(version);
        const result = await acquisitionWorker.acquireRuntime(version);
        await assertAcquisitionSucceeded(installKey, result.dotnetPath, eventStream, context);
    }

    async function AssertInstallSDK(acquisitionWorker : DotnetCoreAcquisitionWorker, context : MockExtensionContext, eventStream : MockEventStream, version : string)
    {
        const installKey = acquisitionWorker.getInstallKey(version);
        const result = await acquisitionWorker.acquireSDK(version);
        await assertAcquisitionSucceeded(installKey, result.dotnetPath, eventStream, context, false);
    }

    test('Acquire Runtime Version', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);
        const version = '1.0';
        await AssertInstallRuntime(acquisitionWorker, context, eventStream, version);
    });

    test('Acquire SDK Version', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(false);
        const version = '5.0';
        await AssertInstallSDK(acquisitionWorker, context, eventStream, version);
    });

    test('Acquire SDK Status', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(false);
        const version = '5.0';
        const installKey = acquisitionWorker.getInstallKey(version);
        let result = await acquisitionWorker.acquireStatus(version, false);
        assert.isUndefined(result);
        const undefinedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusUndefined);
        assert.exists(undefinedEvent, 'Undefined event exists');

        await acquisitionWorker.acquireSDK(version);
        result = await acquisitionWorker.acquireStatus(version, false);
        await assertAcquisitionSucceeded(installKey, result!.dotnetPath, eventStream, context, false);
        const resolvedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusResolved);
        assert.exists(resolvedEvent, 'The sdk is resolved');
    });

    test('Acquire Runtime Status', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);
        const version = '5.0';
        const installKey = acquisitionWorker.getInstallKey(version);
        let result = await acquisitionWorker.acquireStatus(version, true);
        assert.isUndefined(result);
        const undefinedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusUndefined);
        assert.exists(undefinedEvent);

        await acquisitionWorker.acquireSDK(version);
        result = await acquisitionWorker.acquireStatus(version, true);
        await assertAcquisitionSucceeded(installKey, result!.dotnetPath, eventStream, context, true);
        const resolvedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusResolved);
        assert.exists(resolvedEvent);
    });

    test('Acquire Runtime Version Multiple Times', async () => {
        const numAcquisitions = 3;
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);

        for (let i = 0; i < numAcquisitions; i++) {
            const version = '1.0';
            const pathResult = await acquisitionWorker.acquireRuntime(version);
            const installKey = acquisitionWorker.getInstallKey(version);
            await assertAcquisitionSucceeded(installKey, pathResult.dotnetPath, eventStream, context);
        }

        // AcquisitionInvoker was only called once
        const acquireEvents = eventStream.events.filter(event => event instanceof TestAcquireCalled);
        assert.lengthOf(acquireEvents, 1);
    });

    test('Acquire Multiple Versions and UninstallAll', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);
        const versions = ['1.0', '1.1', '2.0', '2.1', '2.2'];
        for (const version of versions) {
            const installKey = acquisitionWorker.getInstallKey(version);
            const res = await acquisitionWorker.acquireRuntime(version);
            await assertAcquisitionSucceeded(installKey, res.dotnetPath, eventStream, context);
        }
        await acquisitionWorker.uninstallAll();
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
        assert.isEmpty(context.get<string[]>(installingVersionsKey, []));
        assert.isEmpty(context.get<string[]>(installedVersionsKey, []));
    });

    test('Acquire Runtime and UninstallAll', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);

        const version = '1.0';
        const installKey = acquisitionWorker.getInstallKey(version);
        const res = await acquisitionWorker.acquireRuntime(version);
        await assertAcquisitionSucceeded(installKey, res.dotnetPath, eventStream, context);

        await acquisitionWorker.uninstallAll();
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
        assert.isEmpty(context.get<string[]>(installingVersionsKey, []));
        assert.isEmpty(context.get<string[]>(installedVersionsKey, []));
    });

    test('Correctly Removes Legacy (No-Architecture) Installs', async () =>
    {
        const runtimeV5 = '5.0.00';
        const runtimeV6 = '6.0.00';
        const sdkV5 = '5.0.100';
        const sdkV6 = '6.0.100';

        const [runtimeWorker, events, context] = getTestAcquisitionWorker(true, null);
        // Install 5.0, 6.0 runtime without an architecture
        await AssertInstallRuntime(runtimeWorker, context, events, runtimeV5);
        await AssertInstallRuntime(runtimeWorker, context, events, runtimeV6);

        // Install similar SDKs without an architecture.
        const [sdkWorker, sdkEvents, sdkContext] = getTestAcquisitionWorker(false, null);
        await AssertInstallSDK(sdkWorker, sdkContext, sdkEvents, sdkV5);
        await AssertInstallSDK(sdkWorker, sdkContext, sdkEvents, sdkV6);

        // Install 5.0 runtime with an architecture. Share the same event stream and context.
        runtimeWorker.installingArchitecture = os.arch();
        await AssertInstallRuntime(runtimeWorker, context, events, runtimeV5);

        // 5.0 legacy runtime should be replaced, but 6.0 runtime should remain, and all SDK items should remain.
        let remainingInstalls = context.get<string[]>(installedVersionsKey, []).concat(sdkContext.get<string[]>(installedVersionsKey, []));
        assert.deepStrictEqual(remainingInstalls, [runtimeV6, '5.0.00~x64', sdkV5, sdkV6],
            'Only The Requested Legacy Runtime is replaced when new runtime is installed');

        // Install a legacy runtime again to make sure its not removed when installing a new SDK with the same version
        runtimeWorker.installingArchitecture = null;
        await AssertInstallRuntime(runtimeWorker, context, events, runtimeV5);

        // Install non-legacy SDK
        sdkWorker.installingArchitecture = os.arch();
        await AssertInstallSDK(sdkWorker, sdkContext, sdkEvents, sdkV5);

        // 6.0 sdk legacy should remain, as well as 5.0 and 6.0 runtime. 5.0 SDK should be removed.
        remainingInstalls = context.get<string[]>(installedVersionsKey, []).concat(sdkContext.get<string[]>(installedVersionsKey, []));
        assert.deepStrictEqual(remainingInstalls, [runtimeV6, '5.0.00~x64', runtimeV5, sdkV6, '5.0.100~x64'],
            'Only The Requested Legacy SDK is replaced when new SDK is installed');
    });

    test('Repeated Acquisition', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);
        for (let i = 0; i < 3; i++) {
            await acquisitionWorker.acquireRuntime('1.0');
        }
        // We should only actually Acquire once
        const events = eventStream.events.filter(event => event instanceof DotnetAcquisitionStarted);
        assert.equal(events.length, 1);
    });

    test('Error is Redirected on Acquisition Failure', async () => {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const acquisitionWorker = new DotnetCoreAcquisitionWorker({
            storagePath: '',
            extensionState: context,
            eventStream,
            acquisitionInvoker: new RejectingAcquisitionInvoker(eventStream),
            installationValidator: new MockInstallationValidator(eventStream),
            timeoutValue: 10,
            installDirectoryProvider: new RuntimeInstallationDirectoryProvider(''),
        });

        return assert.isRejected(acquisitionWorker.acquireRuntime('1.0'), '.NET Acquisition Failed: Installation failed: Rejecting message');
    });

    test('Repeated SDK Acquisition', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(false);
        for (let i = 0; i < 3; i++) {
            await acquisitionWorker.acquireSDK('5.0');
        }
        // We should only actually Acquire once
        const events = eventStream.events.filter(event => event instanceof DotnetAcquisitionStarted);
        assert.equal(events.length, 1);
    });

    test('Get Expected Path With Apostrophe In Install path', async () => {
        if(os.platform() === 'win32'){
            const [acquisitionWorker, eventStream, context] = getTestApostropheAcquisitionWorker(true);
            const result = await acquisitionWorker.acquireRuntime('1.0');
            const expectedPath = getExpectedPath('1.0', true);
            assert.equal(result.dotnetPath, expectedPath);
        }
    });
});
