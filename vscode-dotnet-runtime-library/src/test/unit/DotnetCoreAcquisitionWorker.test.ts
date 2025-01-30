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
    TestAcquireCalled
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
import { IEventStream } from '../../EventStream/EventStream';
import { DotnetInstallType} from '../../IDotnetAcquireContext';
import { getInstallIdCustomArchitecture } from '../../Utils/InstallIdUtilities';
import { InstallTrackerSingleton } from '../../Acquisition/InstallTrackerSingleton';
import { getDotnetExecutable } from '../../Utils/TypescriptUtilities';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';

const assert = chai.assert;
chai.use(chaiAsPromised);
const expectedTimeoutTime = 9000;

suite('DotnetCoreAcquisitionWorker Unit Tests', function () {
    const installingVersionsKey = 'installing';
    const installedVersionsKey = 'installed';
    const dotnetFolderName = `.dotnet O'Hare O'Donald`;

    this.afterEach(async () => {
        // Tear down tmp storage for fresh run
        InstallTrackerSingleton.getInstance(new MockEventStream(), new MockExtensionContext()).clearPromises();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    function setupStates(): [MockEventStream, MockExtensionContext]
    {
        const extContext = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const _ = new MockInstallTracker(eventStream, extContext);
        return [eventStream, extContext];
    }

    function setupWorker(workerContext : IAcquisitionWorkerContext, eventStream : IEventStream) : [MockDotnetCoreAcquisitionWorker, IAcquisitionInvoker]
    {
        const acquisitionWorker = getMockAcquisitionWorker(workerContext);
        const invoker = new NoInstallAcquisitionInvoker(eventStream, acquisitionWorker);

        return [acquisitionWorker, invoker];
    }

    async function callAcquire(workerContext : IAcquisitionWorkerContext, acquisitionWorker : DotnetCoreAcquisitionWorker, invoker : IAcquisitionInvoker)
    {
        const result = workerContext.acquisitionContext.mode === undefined || workerContext.acquisitionContext.mode === 'runtime' ?
        await acquisitionWorker.acquireLocalRuntime(workerContext, invoker) :
        workerContext.acquisitionContext.mode === 'sdk' ? await acquisitionWorker.acquireLocalSDK(workerContext, invoker) :
        workerContext.acquisitionContext.mode === 'aspnetcore' ? await acquisitionWorker.acquireLocalASPNET(workerContext, invoker) :
        {} as { dotnetPath: string };

        return result;
    }

    function migrateContextToNewInstall(worker : IAcquisitionWorkerContext, newVersion : string, newArch : string | null | undefined)
    {
        worker.acquisitionContext.version = newVersion;
        worker.acquisitionContext.architecture = newArch;
    }

    function getExpectedPath(installId: string, mode: DotnetInstallMode): string
    {
        if(mode === 'runtime' || mode === 'aspnetcore')
        {
            return path.join(dotnetFolderName, installId, getDotnetExecutable())
        }
        else if(mode === 'sdk')
        {
            return path.join(dotnetFolderName, getDotnetExecutable());
        }

        return 'There is a mode without a designated return path';
    }

    async function assertAcquisitionSucceeded(installId: string,
        exePath: string,
        eventStream: MockEventStream,
        context: MockExtensionContext,
        mode : DotnetInstallMode = 'runtime')
    {
        const expectedPath = getExpectedPath(installId, mode);

        // Path to exe should be correct
        assert.equal(exePath, expectedPath, 'The exe path is correct');

        // Should be finished installing
        assert.isEmpty(context.get<string[]>(installingVersionsKey, []), 'There are no versions marked as still installing');
        assert.isNotEmpty(context.get<string[]>(installedVersionsKey, []), 'There is a version marked as installed');
        assert.include(context.get<InstallRecord[]>(installedVersionsKey, []).map(x => x.dotnetInstall.installId), installId, 'The version marked as installed is the expected version');

        //  No errors in event stream
        assert.notExists(eventStream.events.find(event => event.type === EventType.DotnetAcquisitionError));
        const startEvent = eventStream.events
            .find(event => event instanceof DotnetAcquisitionStarted && (event as DotnetAcquisitionStarted).install.installId === installId);
        assert.exists(startEvent, 'The acquisition started event appears');
        const completedEvent = eventStream.events
            .find(event => event instanceof DotnetAcquisitionCompleted && (event as DotnetAcquisitionCompleted).install.installId === installId
                && (event as DotnetAcquisitionCompleted).dotnetPath === expectedPath);
        assert.exists(completedEvent, `The acquisition completed event appears for install id ${installId} and path ${expectedPath}`);

        //  Acquire got called with the correct args
        const acquireEvent = eventStream.events.find(event =>
            event instanceof TestAcquireCalled &&
            getInstallIdCustomArchitecture((event as TestAcquireCalled).context.version,
                (event as TestAcquireCalled).context.architecture, mode, (event as TestAcquireCalled).context.installType)
            === installId
        ) as TestAcquireCalled;

        assert.exists(acquireEvent, `The acquisition acquire event appears. Events: ${eventStream.events.filter(event =>
            event instanceof TestAcquireCalled).map((e) => e.eventName).join(', ')};`);
        assert.equal(acquireEvent!.context.dotnetPath, expectedPath, 'The acquisition went to the expected dotnetPath');
        assert.equal(acquireEvent!.context.installDir, path.dirname(expectedPath), 'The acquisition went to the expected installation directory');
    }

    this.beforeAll(async () => {
        process.env._VSCODE_DOTNET_INSTALL_FOLDER = dotnetFolderName;
    });

    async function AssertInstall(acquisitionWorker : DotnetCoreAcquisitionWorker, context : MockExtensionContext, eventStream : MockEventStream, version : string,
        invoker : IAcquisitionInvoker, workerContext : IAcquisitionWorkerContext)
    {
        const installId = getInstallIdCustomArchitecture(workerContext.acquisitionContext.version, workerContext.acquisitionContext.architecture,
            workerContext.acquisitionContext.mode ?? 'runtime', workerContext.acquisitionContext.installType ?? 'local');

        const result = await callAcquire(workerContext, acquisitionWorker, invoker);

        await assertAcquisitionSucceeded(installId, result.dotnetPath, eventStream, context, workerContext.acquisitionContext.mode!);
    }

    async function acquireWithVersion(version : string, mode : DotnetInstallMode)
    {
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext(mode, version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);

        await AssertInstall(acquisitionWorker, extContext, eventStream, version, invoker, ctx);
    }

    async function acquireStatus(version : string, mode : DotnetInstallMode, type : DotnetInstallType)
    {
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext(mode, version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);
        const installId = getInstallIdCustomArchitecture(ctx.acquisitionContext.version, ctx.acquisitionContext.architecture, mode, type);

        let result = await acquisitionWorker.acquireStatus(ctx, mode);
        assert.isUndefined(result);
        const undefinedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusUndefined);
        assert.exists(undefinedEvent, 'Undefined event exists');

        await callAcquire(ctx, acquisitionWorker, invoker);

        result = await acquisitionWorker.acquireStatus(ctx, mode, undefined);
        await assertAcquisitionSucceeded(installId, result!.dotnetPath, eventStream, extContext, mode);
        const resolvedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusResolved);
        assert.exists(resolvedEvent, 'The sdk is resolved');
    }

    async function repeatAcquisition(version : string, mode : DotnetInstallMode)
    {
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext(mode, version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);

        for (let i = 0; i < 3; i++)
        {
            await callAcquire(ctx, acquisitionWorker, invoker);
        }

        // We should only actually Acquire once
        const events = eventStream.events.filter(event => event instanceof DotnetAcquisitionStarted);
        assert.equal(events.length, 1);
    }

    async function acquireAndUninstallAll(version : string, mode : DotnetInstallMode, type : DotnetInstallType)
    {
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext(mode, version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);

        const installId = getInstallIdCustomArchitecture(ctx.acquisitionContext.version, ctx.acquisitionContext.architecture, mode, type);
        const res = await callAcquire(ctx, acquisitionWorker, invoker);
        await assertAcquisitionSucceeded(installId, res.dotnetPath, eventStream, extContext, mode);

        await acquisitionWorker.uninstallAll(ctx.eventStream, ctx.installDirectoryProvider.getStoragePath(), ctx.extensionState);
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
        assert.isEmpty(extContext.get<string[]>(installingVersionsKey, []));
        assert.isEmpty(extContext.get<string[]>(installedVersionsKey, []));
    }

    test('Acquire Runtime Version', async () =>
    {
        await acquireWithVersion('1.0', 'runtime');
    }).timeout(expectedTimeoutTime);

    test('Acquire SDK Version', async () => {
        await acquireWithVersion('5.0', 'sdk');
    }).timeout(expectedTimeoutTime);

    test('Acquire ASP.NET Runtime Version', async () =>
    {
        await acquireWithVersion('1.0', 'aspnetcore');
    }).timeout(expectedTimeoutTime);

    test('Acquire SDK Status', async () => {
        await acquireStatus('5.0', 'sdk', 'local');
    }).timeout(expectedTimeoutTime);

    test('Acquire Runtime Status', async () => {
        await acquireStatus('5.0', 'runtime', 'local');
    }).timeout(expectedTimeoutTime);

    test('Acquire ASP.NET Runtime Status', async () => {
        await acquireStatus('5.0', 'aspnetcore', 'local');
    }).timeout(expectedTimeoutTime);

    test('Acquire Runtime Version Multiple Times', async () => {
        const numAcquisitions = 3;
        const version = '1.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);

        for (let i = 0; i < numAcquisitions; i++) {
            const pathResult = await acquisitionWorker.acquireLocalRuntime(ctx, invoker);
            const installId = getInstallIdCustomArchitecture(ctx.acquisitionContext.version, ctx.acquisitionContext.architecture, 'runtime', 'local');
            await assertAcquisitionSucceeded(installId, pathResult.dotnetPath, eventStream, extContext);
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
            const res = await acquisitionWorker.acquireLocalRuntime(ctx, invoker);
            const installId = getInstallIdCustomArchitecture(ctx.acquisitionContext.version, ctx.acquisitionContext.architecture, 'runtime', 'local');
            await assertAcquisitionSucceeded(installId, res.dotnetPath, eventStream, extContext);
        }

        await acquisitionWorker!.uninstallAll(eventStream, ctx.installDirectoryProvider.getStoragePath(), ctx.extensionState);
        assert.exists(eventStream!.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream!.events.find(event => event instanceof DotnetUninstallAllCompleted));
        assert.isEmpty(extContext!.get<string[]>(installingVersionsKey, []));
        assert.isEmpty(extContext!.get<string[]>(installedVersionsKey, []));
    }).timeout(expectedTimeoutTime * 5);

    test('Acquire Runtime and UninstallAll', async () =>
    {
        await acquireAndUninstallAll('1.0', 'runtime', 'local');
    }).timeout(expectedTimeoutTime);

    test('Acquire ASP.NET and UninstallAll', async () =>
    {
        await acquireAndUninstallAll('1.0', 'aspnetcore', 'local');
    }).timeout(expectedTimeoutTime);

    test('Acquire SDK and UninstallAll', async () =>
    {
        await acquireAndUninstallAll('6.0', 'sdk', 'local');
    }).timeout(expectedTimeoutTime);

    test('Graveyard Removes Failed Uninstalls', async () => {
        const version = '1.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, invoker] = setupWorker(ctx, eventStream);
        const installId = getInstallIdCustomArchitecture(ctx.acquisitionContext.version, ctx.acquisitionContext.architecture, 'runtime', 'local');
        const install = GetDotnetInstallInfo(version, 'runtime', 'local', os.arch());

        const res = await acquisitionWorker.acquireLocalRuntime(ctx, invoker);
        await assertAcquisitionSucceeded(installId, res.dotnetPath, eventStream, extContext);
        acquisitionWorker.AddToGraveyard(ctx, install, 'Not applicable');

        const versionToKeep = '5.0';
        migrateContextToNewInstall(ctx, versionToKeep, os.arch());
        await acquisitionWorker.acquireLocalRuntime(ctx, invoker);

        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallGraveyardEvent), 'The graveyard tried to uninstall .NET');
        assert.isEmpty(extContext.get<InstallRecord[]>(installingVersionsKey, []), 'We did not hang/ get interrupted during the install.');
        assert.deepEqual(extContext.get<InstallRecord[]>(installedVersionsKey, []),
        [
          {
            dotnetInstall: {
              architecture: 'x64',
              installId: '5.0~x64',
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
        await AssertInstall(worker, extensionContext, eventStream, runtimeV5, invoker, ctx);
        migrateContextToNewInstall(ctx, runtimeV6, null);
        await AssertInstall(worker, extensionContext, eventStream, runtimeV6, invoker, ctx);

        // Install similar SDKs without an architecture.
        const sdkCtx = getMockAcquisitionContext('sdk', sdkV5, expectedTimeoutTime, eventStream, extensionContext, null);
        await AssertInstall(worker, extensionContext, eventStream, sdkV5, invoker, sdkCtx);
        migrateContextToNewInstall(sdkCtx, sdkV6, null);
        await AssertInstall(worker, extensionContext, eventStream, sdkV6, invoker, sdkCtx);

        // Install 5.0 runtime with an architecture. Share the same event stream and context.
        migrateContextToNewInstall(ctx, runtimeV5, os.arch());
        await AssertInstall(worker, extensionContext, eventStream, runtimeV5, invoker, ctx);

        // 5.0 legacy runtime should be replaced, but 6.0 runtime should remain, and all SDK items should remain.
        let detailedRemainingInstalls : InstallRecord[] = extensionContext.get<InstallRecord[]>(installedVersionsKey, []);
        let remainingInstalls : string[] = detailedRemainingInstalls.map(x => x.dotnetInstall.installId);
        assert.deepStrictEqual(remainingInstalls, ['5.0.00~x64', runtimeV6, sdkV5, sdkV6],
            'Only The Requested Legacy Runtime is replaced when new runtime is installed');

        // Install a legacy runtime again to make sure its not removed when installing a new SDK with the same version
        migrateContextToNewInstall(ctx, runtimeV5, null);
        await AssertInstall(worker, extensionContext, eventStream, runtimeV5, invoker, ctx);

        // Install non-legacy SDK
        migrateContextToNewInstall(sdkCtx, sdkV5, os.arch());
        await AssertInstall(worker, extensionContext, eventStream, sdkV5, invoker, sdkCtx);

        // 6.0 sdk legacy should remain, as well as 5.0 and 6.0 runtime. 5.0 SDK should be removed.
        detailedRemainingInstalls = extensionContext.get<InstallRecord[]>(installedVersionsKey, []);
        remainingInstalls = detailedRemainingInstalls.map(x => x.dotnetInstall.installId);
        assert.deepStrictEqual(remainingInstalls, ['5.0.00~x64', runtimeV6, sdkV6, runtimeV5, '5.0.100~x64'],
            'Only The Requested Legacy SDK is replaced when new SDK is installed');
    }).timeout(expectedTimeoutTime * 6);

    test('Repeated Runtime Acquisition', async () => {
        await repeatAcquisition('1.0', 'runtime');
    }).timeout(expectedTimeoutTime);

    test('Repeated ASP.NET Acquisition', async () => {
        await repeatAcquisition('1.0', 'aspnetcore');
    }).timeout(expectedTimeoutTime);

    test('Repeated SDK Acquisition', async () => {
        await repeatAcquisition('5.0', 'sdk');
    }).timeout(expectedTimeoutTime);

    test('Error is Redirected on Acquisition Failure', async () => {
        const version = '1.0';
        const [eventStream, extContext] = setupStates();
        const ctx = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
        const [acquisitionWorker, _] = setupWorker(ctx, eventStream);
        const acquisitionInvoker = new RejectingAcquisitionInvoker(eventStream);

        return assert.isRejected(acquisitionWorker.acquireLocalRuntime(ctx, acquisitionInvoker), '.NET Acquisition Failed: "Rejecting message"');
    }).timeout(expectedTimeoutTime);

    test('Get Expected Path With Apostrophe In Install path', async () => {
        if(os.platform() === 'win32'){
            const installApostropheFolder = `test' for' apostrophe`;
            const version = '1.0';
            const [eventStream, extContext] = setupStates();
            const acquisitionContext = getMockAcquisitionContext('runtime', version, expectedTimeoutTime, eventStream, extContext);
            const [acquisitionWorker, invoker] = setupWorker(acquisitionContext, eventStream);
            const acquisitionInvoker = new MockAcquisitionInvoker(acquisitionContext, installApostropheFolder);

            const installId = getInstallIdCustomArchitecture(version, os.arch(), 'runtime', 'local');
            const result = await acquisitionWorker.acquireLocalRuntime(acquisitionContext, acquisitionInvoker);
            const expectedPath = getExpectedPath(installId, acquisitionContext.acquisitionContext.mode!);
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
