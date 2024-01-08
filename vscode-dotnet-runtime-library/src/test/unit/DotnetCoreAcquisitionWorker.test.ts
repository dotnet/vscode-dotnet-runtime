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
    NoInstallAcquisitionInvoker,
    RejectingAcquisitionInvoker,
} from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockAcquisitionWorker } from './TestUtility';
import { IAcquisitionInvoker } from '../../Acquisition/IAcquisitionInvoker';
import { escape } from 'querystring';
const assert = chai.assert;
chai.use(chaiAsPromised);
const expectedTimeoutTime = 6000;

suite('DotnetCoreAcquisitionWorker Unit Tests', function () {
    const installingVersionsKey = 'installing';
    const installedVersionsKey = 'installed';
    const dotnetFolderName = `.dotnet O'Hare O'Donald`;

    function setupWorker(isRuntimeWorker : boolean, version : string, arch? : string | null): [MockDotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext, IAcquisitionInvoker]
    {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const acquisitionWorker = getMockAcquisitionWorker(isRuntimeWorker, version, arch, eventStream, context);
        const invoker = new NoInstallAcquisitionInvoker(eventStream);
        return [acquisitionWorker, eventStream, context, invoker];
    }

    function migrateWorkerToNewInstall(worker : MockDotnetCoreAcquisitionWorker, newVersion : string, newArch? : string | null)
    {
        worker.updateVersion(newVersion);
        if(newArch)
        {
            worker.updateArch(newArch);
        }
        return worker;
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

    async function AssertInstallRuntime(acquisitionWorker : DotnetCoreAcquisitionWorker, context : MockExtensionContext, eventStream : MockEventStream, version : string, invoker : IAcquisitionInvoker)
    {
        const installKey = acquisitionWorker.getInstallKey(version);
        const result = await acquisitionWorker.acquireRuntime(version, invoker);
        await assertAcquisitionSucceeded(installKey, result.dotnetPath, eventStream, context);
    }

    async function AssertInstallSDK(acquisitionWorker : DotnetCoreAcquisitionWorker, context : MockExtensionContext, eventStream : MockEventStream, version : string, invoker : IAcquisitionInvoker)
    {
        const installKey = acquisitionWorker.getInstallKey(version);
        const result = await acquisitionWorker.acquireSDK(version, invoker);
        await assertAcquisitionSucceeded(installKey, result.dotnetPath, eventStream, context, false);
    }

    test('Acquire Runtime Version', async () => {
        const version = '1.0';
        const [acquisitionWorker, eventStream, context, invoker] = setupWorker(true, version);
        await AssertInstallRuntime(acquisitionWorker, context, eventStream, version, invoker);
    });

    test('Acquire SDK Version', async () => {
        const version = '5.0';
        const [acquisitionWorker, eventStream, context, invoker] = setupWorker(false, version);
        await AssertInstallSDK(acquisitionWorker, context, eventStream, version, invoker);
    });

    test('Acquire SDK Status', async () => {
        const version = '5.0';
        const [acquisitionWorker, eventStream, context, invoker] = setupWorker(false, version);
        const installKey = acquisitionWorker.getInstallKey(version);
        let result = await acquisitionWorker.acquireStatus(version, false);
        assert.isUndefined(result);
        const undefinedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusUndefined);
        assert.exists(undefinedEvent, 'Undefined event exists');

        await acquisitionWorker.acquireSDK(version, invoker);
        result = await acquisitionWorker.acquireStatus(version, false);
        await assertAcquisitionSucceeded(installKey, result!.dotnetPath, eventStream, context, false);
        const resolvedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusResolved);
        assert.exists(resolvedEvent, 'The sdk is resolved');
    });

    test('Acquire Runtime Status', async () => {
        const version = '5.0';
        const [acquisitionWorker, eventStream, context, invoker] = setupWorker(true, version);
        const installKey = acquisitionWorker.getInstallKey(version);
        let result = await acquisitionWorker.acquireStatus(version, true);
        assert.isUndefined(result);
        const undefinedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusUndefined);
        assert.exists(undefinedEvent);

        await acquisitionWorker.acquireSDK(version, invoker);
        result = await acquisitionWorker.acquireStatus(version, true);
        await assertAcquisitionSucceeded(installKey, result!.dotnetPath, eventStream, context, true);
        const resolvedEvent = eventStream.events.find(event => event instanceof DotnetAcquisitionStatusResolved);
        assert.exists(resolvedEvent);
    });

    test('Acquire Runtime Version Multiple Times', async () => {
        const numAcquisitions = 3;
        const version = '1.0';
        const [acquisitionWorker, eventStream, context, invoker] = setupWorker(true, version);

        for (let i = 0; i < numAcquisitions; i++) {
            const pathResult = await acquisitionWorker.acquireRuntime(version, invoker);
            const installKey = acquisitionWorker.getInstallKey(version);
            await assertAcquisitionSucceeded(installKey, pathResult.dotnetPath, eventStream, context);
        }

        // AcquisitionInvoker was only called once
        const acquireEvents = eventStream.events.filter(event => event instanceof TestAcquireCalled);
        assert.lengthOf(acquireEvents, 1);
    });

    test('Acquire Multiple Versions and UninstallAll', async () => {
        const versions = ['1.0', '1.1', '2.0', '2.1', '2.2'];
        const [acquisitionWorker, eventStream, context, invoker] = setupWorker(true, versions[0]);

        for (const version of versions)
        {
            const installKey = acquisitionWorker.getInstallKey(version);
            migrateWorkerToNewInstall(acquisitionWorker, version);
            const res = await acquisitionWorker.acquireRuntime(version, invoker);
            await assertAcquisitionSucceeded(installKey, res.dotnetPath, eventStream, context);
        }

        await acquisitionWorker!.uninstallAll();
        assert.exists(eventStream!.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream!.events.find(event => event instanceof DotnetUninstallAllCompleted));
        assert.isEmpty(context!.get<string[]>(installingVersionsKey, []));
        assert.isEmpty(context!.get<string[]>(installedVersionsKey, []));
    });

    test('Acquire Runtime and UninstallAll', async () => {
        const version = '1.0';
        const [acquisitionWorker, eventStream, context, invoker] = setupWorker(true, version);

        const installKey = acquisitionWorker.getInstallKey(version);
        const res = await acquisitionWorker.acquireRuntime(version, invoker);
        await assertAcquisitionSucceeded(installKey, res.dotnetPath, eventStream, context);

        await acquisitionWorker.uninstallAll();
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
        assert.isEmpty(context.get<string[]>(installingVersionsKey, []));
        assert.isEmpty(context.get<string[]>(installedVersionsKey, []));
    });

    test('Graveyard Removes Failed Uninstalls', async () => {
        const version = '1.0';
        const [acquisitionWorker, eventStream, context, invoker] = setupWorker(true, version);
        const installKey = acquisitionWorker.getInstallKey(version);
        const res = await acquisitionWorker.acquireRuntime(version, invoker);
        await assertAcquisitionSucceeded(installKey, res.dotnetPath, eventStream, context);
        acquisitionWorker.AddToGraveyard(installKey, 'Not applicable');

        const versionToKeep = '5.0';
        const versionToKeepKey = acquisitionWorker.getInstallKey(versionToKeep);
        migrateWorkerToNewInstall(acquisitionWorker, versionToKeep);
        await acquisitionWorker.acquireRuntime(versionToKeep, invoker);

        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallGraveyardEvent), 'The graveyard tried to uninstall .NET');
        assert.isEmpty(context.get<string[]>(installingVersionsKey, []), 'We did not hang/ get interrupted during the install.');
        assert.deepEqual(context.get<string[]>(installedVersionsKey, []), [versionToKeepKey], '.NET was successfully uninstalled and cleaned up properly when marked to be.');
    });

    test('Correctly Removes Legacy (No-Architecture) Installs', async () =>
    {
        const runtimeV5 = '5.0.00';
        const runtimeV6 = '6.0.00';
        const sdkV5 = '5.0.100';
        const sdkV6 = '6.0.100';

        const [runtimeWorker, events, context, runtimeInvoker] = setupWorker(true, runtimeV5, null);
        // Install 5.0, 6.0 runtime without an architecture
        await AssertInstallRuntime(runtimeWorker, context, events, runtimeV5, runtimeInvoker);
        migrateWorkerToNewInstall(runtimeWorker, runtimeV6, null);
        await AssertInstallRuntime(runtimeWorker, context, events, runtimeV6, runtimeInvoker);

        // Install similar SDKs without an architecture.
        const [sdkWorker, sdkEvents, sdkContext, sdkInvoker] = setupWorker(false, sdkV5, null);
        await AssertInstallSDK(sdkWorker, sdkContext, sdkEvents, sdkV5, sdkInvoker);
        migrateWorkerToNewInstall(sdkWorker, sdkV6, null);
        await AssertInstallSDK(sdkWorker, sdkContext, sdkEvents, sdkV6, sdkInvoker);

        // Install 5.0 runtime with an architecture. Share the same event stream and context.
        runtimeWorker.installingArchitecture = os.arch();
        migrateWorkerToNewInstall(runtimeWorker, runtimeV5);
        await AssertInstallRuntime(runtimeWorker, context, events, runtimeV5, runtimeInvoker);

        // 5.0 legacy runtime should be replaced, but 6.0 runtime should remain, and all SDK items should remain.
        let remainingInstalls = context.get<string[]>(installedVersionsKey, []).concat(sdkContext.get<string[]>(installedVersionsKey, []));
        assert.deepStrictEqual(remainingInstalls, [runtimeV6, '5.0.00~x64', sdkV5, sdkV6],
            'Only The Requested Legacy Runtime is replaced when new runtime is installed');

        // Install a legacy runtime again to make sure its not removed when installing a new SDK with the same version
        runtimeWorker.installingArchitecture = null;
        await AssertInstallRuntime(runtimeWorker, context, events, runtimeV5, runtimeInvoker);

        // Install non-legacy SDK
        sdkWorker.installingArchitecture = os.arch();
        migrateWorkerToNewInstall(sdkWorker, sdkV5);
        await AssertInstallSDK(sdkWorker, sdkContext, sdkEvents, sdkV5, sdkInvoker);

        // 6.0 sdk legacy should remain, as well as 5.0 and 6.0 runtime. 5.0 SDK should be removed.
        remainingInstalls = context.get<string[]>(installedVersionsKey, []).concat(sdkContext.get<string[]>(installedVersionsKey, []));
        assert.deepStrictEqual(remainingInstalls, [runtimeV6, '5.0.00~x64', runtimeV5, sdkV6, '5.0.100~x64'],
            'Only The Requested Legacy SDK is replaced when new SDK is installed');
    });

    test('Repeated Acquisition', async () => {
        const version = '1.0';
        const [acquisitionWorker, eventStream, _, invoker] = setupWorker(true, version);

        for (let i = 0; i < 3; i++)
        {
            await acquisitionWorker.acquireRuntime(version, invoker);
        }
        // We should only actually Acquire once
        const events = eventStream.events.filter(event => event instanceof DotnetAcquisitionStarted);
        assert.equal(events.length, 1);
    });

    test('Error is Redirected on Acquisition Failure', async () => {
        const version = '1.0';
        const [acquisitionWorker, eventStream, _, __] = setupWorker(true, version);
        const acquisitionInvoker = new RejectingAcquisitionInvoker(eventStream);

        return assert.isRejected(acquisitionWorker.acquireRuntime(version, acquisitionInvoker), '.NET Acquisition Failed: Installation failed: Rejecting message');
    });

    test('Repeated SDK Acquisition', async () => {
        const version = '5.0';
        const [acquisitionWorker, eventStream, _, invoker] = setupWorker(true, version);

        for (let i = 0; i < 3; i++)
        {
            await acquisitionWorker.acquireSDK(version, invoker);
        }
        // We should only actually Acquire once
        const events = eventStream.events.filter(event => event instanceof DotnetAcquisitionStarted);
        assert.equal(events.length, 1);
    });

    test('Get Expected Path With Apostrophe In Install path', async () => {
        if(os.platform() === 'win32'){
            const installApostropheFolder = `test' for' apostrophe`;
            const version = '1.0';
            const acquisitionContext = getMockAcquisitionContext(false, version);
            const acquisitionWorker = getMockAcquisitionWorker(true, version);
            const acquisitionInvoker = new MockAcquisitionInvoker(acquisitionContext, installApostropheFolder);

            const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(version, os.arch());
            const result = await acquisitionWorker.acquireRuntime(version, acquisitionInvoker);
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
