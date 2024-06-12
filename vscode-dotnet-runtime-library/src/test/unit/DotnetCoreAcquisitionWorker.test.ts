/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { DotnetCoreAcquisitionWorker } from '../../Acquisition/DotnetCoreAcquisitionWorker';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionStarted,
    DotnetAcquisitionStatusResolved,
    DotnetAcquisitionStatusUndefined,
    DotnetInstallGraveyardEvent,
    DotnetUninstallAllCompleted,
    DotnetUninstallAllStarted,
    TestAcquireCalled,
} from '../../EventStream/EventStreamEvents';
import { EventType } from '../../EventStream/EventType';
import {
    MockAcquisitionInvoker,
    MockDotnetCoreAcquisitionWorker,
    MockEventStream,
    MockExtensionContext,
    MockInstallTracker,
    NoInstallAcquisitionInvoker,
    RejectingAcquisitionInvoker,
} from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockAcquisitionWorker } from './TestUtility';
import { IAcquisitionInvoker } from '../../Acquisition/IAcquisitionInvoker';
import { InstallOwner, InstallRecord } from '../../Acquisition/InstallRecord';
import { GetDotnetInstallInfo } from '../../Acquisition/DotnetInstall';
import { DotnetInstallMode } from '../../Acquisition/DotnetInstallMode';
import { IAcquisitionWorkerContext } from '../../Acquisition/IAcquisitionWorkerContext';
import { InstallTrackerSingleton } from '../../Acquisition/InstallTrackerSingleton';
import { get } from 'http';
import { IEventStream } from '../../EventStream/EventStream';

const assert = chai.assert;
chai.use(chaiAsPromised);
const expectedTimeoutTime = 9000;

suite('DotnetCoreAcquisitionWorker Unit Tests', function () {
    const installingVersionsKey = 'installing';
    const installedVersionsKey = 'installed';
    const dotnetFolderName = `.dotnet O'Hare O'Donald`;

    function setupStates(): [MockEventStream, MockExtensionContext]
    {
        const extContext = new MockExtensionContext();
        const eventStream = new MockEventStream();
        new MockInstallTracker(eventStream, extContext);
        return [eventStream, extContext];
    }

    function setupWorker(workerContext : IAcquisitionWorkerContext, eventStream : IEventStream) : [MockDotnetCoreAcquisitionWorker, IAcquisitionInvoker]
    {
        const acquisitionWorker = getMockAcquisitionWorker(workerContext);
        const invoker = new NoInstallAcquisitionInvoker(eventStream, acquisitionWorker);

        return [acquisitionWorker, invoker];
    }

    function migrateContextToNewInstall(worker : IAcquisitionWorkerContext, newVersion : string, newArch : string | null | undefined)
    {
        worker.acquisitionContext.version = newVersion;
        worker.acquisitionContext.architecture = newArch;
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
        assert.include(context.get<InstallRecord[]>(installedVersionsKey, []).map(x => x.dotnetInstall.installKey), installKey, 'The version marked as installed is the expected version');

        //  No errors in event stream
        assert.notExists(eventStream.events.find(event => event.type === EventType.DotnetAcquisitionError));
        const startEvent = eventStream.events
            .find(event => event instanceof DotnetAcquisitionStarted && (event as DotnetAcquisitionStarted).install.installKey === installKey);
        assert.exists(startEvent, 'The acquisition started event appears');
        const completedEvent = eventStream.events
            .find(event => event instanceof DotnetAcquisitionCompleted && (event as DotnetAcquisitionCompleted).install.installKey === installKey
                && (event as DotnetAcquisitionCompleted).dotnetPath === expectedPath);
        assert.exists(completedEvent, `The acquisition completed event appears for install key ${installKey} and path ${expectedPath}`);

        //  Acquire got called with the correct args
        const acquireEvent = eventStream.events.find(event =>
            event instanceof TestAcquireCalled &&
            ((DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture((event as TestAcquireCalled).context.version,
                (event as TestAcquireCalled).context.architecture, (event as TestAcquireCalled).context.installType)))
                === installKey) as TestAcquireCalled;
        assert.exists(acquireEvent, 'The acquisition acquire event appears');
        assert.equal(acquireEvent!.context.dotnetPath, expectedPath, 'The acquisition went to the expected dotnetPath');
        assert.equal(acquireEvent!.context.installDir, path.dirname(expectedPath), 'The acquisition went to the expected installation directory');
    }

    this.beforeAll(async () => {
        process.env._VSCODE_DOTNET_INSTALL_FOLDER = dotnetFolderName;
    });

    async function AssertInstallRuntime(acquisitionWorker : DotnetCoreAcquisitionWorker, context : MockExtensionContext, eventStream : MockEventStream, version : string,
        invoker : IAcquisitionInvoker, workerContext : IAcquisitionWorkerContext)
    {
        const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(workerContext.acquisitionContext.version, workerContext.acquisitionContext.architecture, 'local');
        const result = await acquisitionWorker.acquireRuntime(workerContext, invoker);
        await assertAcquisitionSucceeded(installKey, result.dotnetPath, eventStream, context);
    }

    async function AssertInstallSDK(acquisitionWorker : DotnetCoreAcquisitionWorker, context : MockExtensionContext, eventStream : MockEventStream, version : string,
        invoker : IAcquisitionInvoker, workerContext : IAcquisitionWorkerContext)
    {
        const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(workerContext.acquisitionContext.version, workerContext.acquisitionContext.architecture, 'local');
        const result = await acquisitionWorker.acquireSDK(workerContext, invoker);
        await assertAcquisitionSucceeded(installKey, result.dotnetPath, eventStream, context, false);
    }

    test('Acquire Runtime Version', async () => {
        const version = '1.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);
        await AssertInstallRuntime(acquisitionWorker, extContext, eventStream, version, invoker, ctx);
    }).timeout(expectedTimeoutTime);

    test('Acquire SDK Version', async () => {
        const version = '5.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('sdk', version, expectedTimeoutTime, eventStream, extContext );
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);
        await AssertInstallSDK(acquisitionWorker, extContext, eventStream, version, invoker, ctx);
    }).timeout(expectedTimeoutTime);

    test('Acquire SDK Status', async () => {
        const version = '5.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('sdk', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);
        const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(ctx.acquisitionContext.version, ctx.acquisitionContext.architecture, 'local');
        let result = await acquisitionWorker.acquireStatus(ctx, 'sdk');
        assert.isUndefined(result);
        const undefinedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusUndefined);
        assert.exists(undefinedEvent, 'Undefined event exists');

        await acquisitionWorker.acquireSDK(ctx, invoker,);
        result = await acquisitionWorker.acquireStatus(ctx, 'sdk', undefined);
        await assertAcquisitionSucceeded(installKey, result!.dotnetPath, eventStream, extContext, false);
        const resolvedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusResolved);
        assert.exists(resolvedEvent, 'The sdk is resolved');
    }).timeout(expectedTimeoutTime);

    test('Acquire Runtime Status', async () => {
        const version = '5.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);
        const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(ctx.acquisitionContext.version, ctx.acquisitionContext.architecture, 'local');
        let result = await acquisitionWorker.acquireStatus(ctx, 'sdk');
        assert.isUndefined(result);
        const undefinedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusUndefined);
        assert.exists(undefinedEvent);

        await acquisitionWorker.acquireRuntime(ctx, invoker,);
        result = await acquisitionWorker.acquireStatus(ctx, 'runtime', undefined);
        await assertAcquisitionSucceeded(installKey, result!.dotnetPath, eventStream, extContext, true);
        const resolvedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusResolved);
        assert.exists(resolvedEvent);
    }).timeout(expectedTimeoutTime);

    test('Acquire Runtime Version Multiple Times', async () => {
        const numAcquisitions = 3;
        const version = '1.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);

        for (let i = 0; i < numAcquisitions; i++) {
            const pathResult = await acquisitionWorker.acquireRuntime(ctx, invoker);
            const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(ctx.acquisitionContext.version, ctx.acquisitionContext.architecture, 'local');
            await assertAcquisitionSucceeded(installKey, pathResult.dotnetPath, eventStream, extContext);
        }

        // AcquisitionInvoker was only called once
        const acquireEvents = eventStream.events.filter(event => event instanceof TestAcquireCalled);
        assert.lengthOf(acquireEvents, 1);
    }).timeout(expectedTimeoutTime);

    test('Acquire Multiple Versions and UninstallAll', async () => {
        const versions = ['1.0', '1.1', '2.0', '2.1', '2.2'];
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('runtime', versions[0], expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);

        for (const version of versions)
        {
            migrateContextToNewInstall(ctx, version, os.arch());
            const res = await acquisitionWorker.acquireRuntime(ctx, invoker);
            const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(ctx.acquisitionContext.version, ctx.acquisitionContext.architecture, 'local');
            await assertAcquisitionSucceeded(installKey, res.dotnetPath, eventStream, extContext);
        }

        await acquisitionWorker!.uninstallAll(eventStream, ctx.installDirectoryProvider.getStoragePath(), ctx.extensionState);
        assert.exists(eventStream!.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream!.events.find(event => event instanceof DotnetUninstallAllCompleted));
        assert.isEmpty(extContext!.get<string[]>(installingVersionsKey, []));
        assert.isEmpty(extContext!.get<string[]>(installedVersionsKey, []));
    }).timeout(expectedTimeoutTime * 5);

    test('Acquire Runtime and UninstallAll', async () =>
    {
        const version = '1.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);

        const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(ctx.acquisitionContext.version, ctx.acquisitionContext.architecture, 'local');
        const res = await acquisitionWorker.acquireRuntime(ctx, invoker);
        await assertAcquisitionSucceeded(installKey, res.dotnetPath, eventStream, extContext);

        await acquisitionWorker.uninstallAll(ctx.eventStream, ctx.installDirectoryProvider.getStoragePath(), ctx.extensionState);
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
        assert.isEmpty(extContext.get<string[]>(installingVersionsKey, []));
        assert.isEmpty(extContext.get<string[]>(installedVersionsKey, []));
    }).timeout(expectedTimeoutTime);

    test('Graveyard Removes Failed Uninstalls', async () => {
        const version = '1.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);
        const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(ctx.acquisitionContext.version, ctx.acquisitionContext.architecture, 'local');
        const install = GetDotnetInstallInfo(version, 'runtime', 'local', os.arch());

        const res = await acquisitionWorker.acquireRuntime(ctx, invoker);
        await assertAcquisitionSucceeded(installKey, res.dotnetPath, eventStream, extContext);
        acquisitionWorker.AddToGraveyard(ctx, install, 'Not applicable');

        const versionToKeep = '5.0';
        migrateContextToNewInstall(ctx, versionToKeep, os.arch());
        await acquisitionWorker.acquireRuntime(ctx, invoker);

        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallGraveyardEvent), 'The graveyard tried to uninstall .NET');
        assert.isEmpty(extContext.get<InstallRecord[]>(installingVersionsKey, []), 'We did not hang/ get interrupted during the install.');
        assert.deepEqual(extContext.get<InstallRecord[]>(installedVersionsKey, []),
        [
          {
            dotnetInstall: {
              architecture: 'x64',
              installKey: '5.0~x64',
              isGlobal: false,
              installMode: 'runtime',
              version: '5.0',
            },
            installingExtensions: [
              'test'
            ] as InstallOwner[],
          }
        ] as InstallRecord[],
        '.NET was successfully uninstalled and cleaned up properly when marked to be.');
    }).timeout(expectedTimeoutTime);

    test('Correctly Removes Legacy (No-Architecture) Installs', async () =>
    {
        const runtimeV5 = '5.0.00';
        const runtimeV6 = '6.0.00';
        const sdkV5 = '5.0.100';
        const sdkV6 = '6.0.100';
        const [eventStream, extensionContext] = setupStates();

        const ctx = getMockAcquisitionContext('runtime', runtimeV5, expectedTimeoutTime, eventStream, extensionContext);
        const [worker, invoker] = setupWorker(ctx, eventStream);

        // Install 5.0, 6.0 runtime without an architecture
        await AssertInstallRuntime(worker, extensionContext, eventStream, runtimeV5, invoker, ctx);
        migrateContextToNewInstall(ctx, runtimeV6, null);
        await AssertInstallRuntime(worker, extensionContext, eventStream, runtimeV6, invoker, ctx);

        // Install similar SDKs without an architecture.
        const sdkCtx = getMockAcquisitionContext('sdk', sdkV5, expectedTimeoutTime, eventStream, extensionContext);
        await AssertInstallSDK(worker, extensionContext, eventStream, sdkV5, invoker, sdkCtx);
        migrateContextToNewInstall(sdkCtx, sdkV6, null);
        await AssertInstallSDK(worker, extensionContext, eventStream, sdkV6, invoker, sdkCtx);

        // Install 5.0 runtime with an architecture. Share the same event stream and context.
        migrateContextToNewInstall(ctx, runtimeV5, os.arch());
        await AssertInstallRuntime(worker, extensionContext, eventStream, runtimeV5, invoker, ctx);

        // 5.0 legacy runtime should be replaced, but 6.0 runtime should remain, and all SDK items should remain.
        let detailedRemainingInstalls : InstallRecord[] = extensionContext.get<InstallRecord[]>(installedVersionsKey, []).concat(extensionContext.get<InstallRecord[]>(installedVersionsKey, []));
        let remainingInstalls : string[] = detailedRemainingInstalls.map(x => x.dotnetInstall.installKey);
        assert.deepStrictEqual(remainingInstalls, [runtimeV6, '5.0.00~x64', sdkV5, sdkV6],
            'Only The Requested Legacy Runtime is replaced when new runtime is installed');

        // Install a legacy runtime again to make sure its not removed when installing a new SDK with the same version
        migrateContextToNewInstall(ctx, runtimeV5, null);
        await AssertInstallRuntime(worker, extensionContext, eventStream, runtimeV5, invoker, ctx);

        // Install non-legacy SDK
        migrateContextToNewInstall(sdkCtx, sdkV5, os.arch());
        await AssertInstallSDK(worker, extensionContext, eventStream, sdkV5, invoker, sdkCtx);

        // 6.0 sdk legacy should remain, as well as 5.0 and 6.0 runtime. 5.0 SDK should be removed.
        detailedRemainingInstalls = extensionContext.get<InstallRecord[]>(installedVersionsKey, []).concat(extensionContext.get<InstallRecord[]>(installedVersionsKey, []));
        remainingInstalls = detailedRemainingInstalls.map(x => x.dotnetInstall.installKey);
        assert.deepStrictEqual(remainingInstalls, [runtimeV6, '5.0.00~x64', runtimeV5, sdkV6, '5.0.100~x64'],
            'Only The Requested Legacy SDK is replaced when new SDK is installed');
    }).timeout(expectedTimeoutTime * 600000);

    test('Repeated Acquisition', async () => {
        const version = '1.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);

        for (let i = 0; i < 3; i++)
        {
            await acquisitionWorker.acquireRuntime(ctx, invoker);
        }
        // We should only actually Acquire once
        const events = eventStream.events.filter(event => event instanceof DotnetAcquisitionStarted);
        assert.equal(events.length, 1);
    }).timeout(expectedTimeoutTime);

    test('Error is Redirected on Acquisition Failure', async () => {
        const version = '1.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, _] = setupWorker(ctx, eventStream);
        const acquisitionInvoker = new RejectingAcquisitionInvoker(eventStream);

        return assert.isRejected(acquisitionWorker.acquireRuntime(ctx, acquisitionInvoker), '.NET Acquisition Failed: Rejecting message');
    }).timeout(expectedTimeoutTime);

    test('Repeated SDK Acquisition', async () => {
        const version = '5.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('sdk', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);

        for (let i = 0; i < 3; i++)
        {
            await acquisitionWorker.acquireSDK(ctx, invoker);
        }
        // We should only actually Acquire once
        const events = eventStream.events.filter(event => event instanceof DotnetAcquisitionStarted);
        assert.equal(events.length, 1);
    }).timeout(expectedTimeoutTime);

    test('Get Expected Path With Apostrophe In Install path', async () => {
        if(os.platform() === 'win32'){
            const installApostropheFolder = `test' for' apostrophe`;
            const version = '1.0';
            const [eventStream, extContext] = setupStates();
            const acquisitionContext = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
            const [acquisitionWorker, invoker] = setupWorker(acquisitionContext, eventStream);
            const acquisitionInvoker = new MockAcquisitionInvoker(acquisitionContext, installApostropheFolder);

            const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(version, os.arch(), 'local');
            const result = await acquisitionWorker.acquireRuntime(acquisitionContext, acquisitionInvoker);
            const expectedPath = getExpectedPath(installKey, true);
            assert.equal(result.dotnetPath, expectedPath);
            deleteFolderRecursive(path.join(process.cwd(), installApostropheFolder));
        }
    }).timeout(expectedTimeoutTime);

    function deleteFolderRecursive(folderPath: string) {
        if (fs.existsSync(folderPath)) {
          fs.readdirSync(folderPath).forEach((file) => {
            const filePath = path.join(folderPath, file);

            if (fs.lstatSync(filePath).isDirectory()) {
              // If the item is a directory, recursively call deleteFolderRecursive
              deleteFolderRecursive(filePath);
            } else {
              // If the item is a file, delete it
              fs.unlinkSync(filePath);
            }
          });

          // After deleting all the files and subfolders, delete the folder itself
          fs.rmdirSync(folderPath);
        }
      }
});
