/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as os from 'os';
import * as path from 'path';
import { DotnetCoreAcquisitionWorker } from '../../Acquisition/DotnetCoreAcquisitionWorker';
import { RuntimeInstallationDirectoryProvider } from '../../Acquisition/RuntimeInstallationDirectoryProvider';
import { SdkInstallationDirectoryProvider } from '../../Acquisition/SdkInstallationDirectoryProvider';
import {
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
    MockEventStream,
    MockExtensionContext,
    MockInstallationValidator,
    NoInstallAcquisitionInvoker,
    RejectingAcquisitionInvoker,
} from '../mocks/MockObjects';
const assert = chai.assert;
chai.use(chaiAsPromised);

suite('DotnetCoreAcquisitionWorker Unit Tests', function() {
    const installingVersionsKey = 'installing';
    const installedVersionsKey = 'installed';
    const dotnetFolderName = `.dotnet O'Hare O'Donald`;

    function getTestAcquisitionWorker(runtimeInstall: boolean): [ DotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext ] {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const acquisitionWorker = new DotnetCoreAcquisitionWorker({
            storagePath: '',
            extensionState: context,
            eventStream,
            acquisitionInvoker: new NoInstallAcquisitionInvoker(eventStream),
            installationValidator: new MockInstallationValidator(eventStream),
            timeoutValue: 10,
            installDirectoryProvider: runtimeInstall ? new RuntimeInstallationDirectoryProvider('') : new SdkInstallationDirectoryProvider(''),
        });
        return [ acquisitionWorker, eventStream, context ];
    }

    function getExpectedPath(version: string, isRuntimeInstall: boolean): string {
        return isRuntimeInstall ?
            path.join(dotnetFolderName, version, os.platform() === 'win32' ? 'dotnet.exe' : 'dotnet') :
            path.join(dotnetFolderName, os.platform() === 'win32' ? 'dotnet.exe' : 'dotnet');
    }

    async function assertAcquisitionSucceeded(version: string,
                                              exePath: string,
                                              eventStream: MockEventStream,
                                              context: MockExtensionContext,
                                              isRuntimeInstall = true) {
        const expectedPath = getExpectedPath(version, isRuntimeInstall);

        // Path to exe should be correct
        assert.equal(exePath, expectedPath);

        // Should be finished installing
        assert.isEmpty(context.get<string[]>(installingVersionsKey, []));
        assert.isNotEmpty(context.get<string[]>(installedVersionsKey, []));
        assert.include(context.get<string[]>(installedVersionsKey, []), version);

        //  No errors in event stream
        assert.notExists(eventStream.events.find(event => event.type === EventType.DotnetAcquisitionError));
        const startEvent = eventStream.events
            .find(event => event instanceof DotnetAcquisitionStarted && (event as DotnetAcquisitionStarted).version === version);
        assert.exists(startEvent);
        const completedEvent = eventStream.events
            .find(event => event instanceof DotnetAcquisitionCompleted && (event as DotnetAcquisitionCompleted).version === version
            && (event as DotnetAcquisitionCompleted).dotnetPath === expectedPath);
        assert.exists(completedEvent);

        //  Acquire got called with the correct args
        const acquireEvent = eventStream.events.find(event =>
            event instanceof TestAcquireCalled && (event as TestAcquireCalled).context.version === version) as TestAcquireCalled;
        assert.exists(acquireEvent);
        assert.equal(acquireEvent!.context.dotnetPath, expectedPath);
        assert.equal(acquireEvent!.context.installDir, path.dirname(expectedPath));
    }

    this.beforeAll(async () => {
        process.env._VSCODE_DOTNET_INSTALL_FOLDER = dotnetFolderName;
    });

    test('Acquire Runtime Version', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);

        const result = await acquisitionWorker.acquireRuntime('1.0');
        await assertAcquisitionSucceeded('1.0', result.dotnetPath, eventStream, context);
    });

    test('Acquire SDK Version', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(false);

        const result = await acquisitionWorker.acquireSDK('5.0');
        await assertAcquisitionSucceeded('5.0', result.dotnetPath, eventStream, context, false);
    });

    test('Acquire SDK Status', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(false);
        const version = '5.0';
        let result = await acquisitionWorker.acquireStatus(version, false);
        assert.isUndefined(result);
        const undefinedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusUndefined);
        assert.exists(undefinedEvent);

        await acquisitionWorker.acquireSDK(version);
        result = await acquisitionWorker.acquireStatus(version, false);
        await assertAcquisitionSucceeded(version, result!.dotnetPath, eventStream, context, false);
        const resolvedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusResolved);
        assert.exists(resolvedEvent);
    });

    test('Acquire Runtime Status', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);
        const version = '5.0';
        let result = await acquisitionWorker.acquireStatus(version, true);
        assert.isUndefined(result);
        const undefinedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusUndefined);
        assert.exists(undefinedEvent);

        await acquisitionWorker.acquireSDK(version);
        result = await acquisitionWorker.acquireStatus(version, true);
        await assertAcquisitionSucceeded(version, result!.dotnetPath, eventStream, context, true);
        const resolvedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusResolved);
        assert.exists(resolvedEvent);
    });

    test('Acquire Runtime Version Multiple Times', async () => {
        const numAcquisitions = 3;
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);

        for (let i = 0; i < numAcquisitions; i++) {
            const pathResult = await acquisitionWorker.acquireRuntime('1.0');
            await assertAcquisitionSucceeded('1.0', pathResult.dotnetPath, eventStream, context);
        }

        // AcquisitionInvoker was only called once
        const acquireEvents = eventStream.events.filter(event => event instanceof TestAcquireCalled);
        assert.lengthOf(acquireEvents, 1);
    });

    test('Acquire Multiple Versions and UninstallAll', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);
        const versions = [ '1.0', '1.1', '2.0', '2.1', '2.2' ];
        for (const version of versions) {
            const res = await acquisitionWorker.acquireRuntime(version);
            await assertAcquisitionSucceeded(version, res.dotnetPath, eventStream, context);
        }
        await acquisitionWorker.uninstallAll();
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
        assert.isEmpty(context.get<string[]>(installingVersionsKey, []));
        assert.isEmpty(context.get<string[]>(installedVersionsKey, []));
    });

    test('Acquire Runtime and UninstallAll', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);

        const res = await acquisitionWorker.acquireRuntime('1.0');
        await assertAcquisitionSucceeded('1.0', res.dotnetPath, eventStream, context);

        await acquisitionWorker.uninstallAll();
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
        assert.isEmpty(context.get<string[]>(installingVersionsKey, []));
        assert.isEmpty(context.get<string[]>(installedVersionsKey, []));
    });

    test('Repeated Acquisition', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);
        for (let i = 0; i < 3; i ++) {
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
        for (let i = 0; i < 3; i ++) {
            await acquisitionWorker.acquireSDK('5.0');
        }
        // We should only actually Acquire once
        const events = eventStream.events.filter(event => event instanceof DotnetAcquisitionStarted);
        assert.equal(events.length, 1);
    });
});
