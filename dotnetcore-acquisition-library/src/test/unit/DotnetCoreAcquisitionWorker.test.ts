/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as os from 'os';
import * as path from 'path';
import { DotnetCoreAcquisitionWorker } from '../../DotnetCoreAcquisitionWorker';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionStarted,
    DotnetUninstallAllCompleted,
    DotnetUninstallAllStarted,
    TestAcquireCalled,
} from '../../EventStreamEvents';
import { EventType } from '../../EventType';
import {
    MockEventStream,
    MockExtensionContext,
    MockVersionResolver,
    NoInstallAcquisitionInvoker,
    versionPairs,
} from '../mocks/MockObjects';
const assert = chai.assert;
chai.use(chaiAsPromised);

suite('DotnetCoreAcquisitionWorker Unit Tests', () => {
    const installingVersionsKey = 'installing';

    function getTestAcquisitionWorker(): [ DotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext ] {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const acquisitionWorker = new DotnetCoreAcquisitionWorker(
            '',
            context,
            eventStream,
            new NoInstallAcquisitionInvoker(eventStream),
            new MockVersionResolver(context, eventStream));
        return [ acquisitionWorker, eventStream, context ];
    }

    function getExpectedPath(version: string): string {
        return path.join('.dotnet', version, os.platform() === 'win32' ? 'dotnet.exe' : 'dotnet');
    }

    async function assertAcquisitionSucceeded(version: string,
                                              exePath: string,
                                              eventStream: MockEventStream,
                                              context: MockExtensionContext) {
        const expectedPath = getExpectedPath(version);

        // Path to exe should be correct
        assert.equal(exePath, expectedPath);

        // Should be finished installing
        assert.isEmpty(context.get(installingVersionsKey));

        //  No errors in event stream
        assert.notExists(eventStream.events.find(event => event.type === EventType.DotnetError));
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
        assert.equal(acquireEvent!.context.installDir, path.join('.dotnet', version));
    }

    test('Acquire Version', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker();

        const pathResult = await acquisitionWorker.acquire(versionPairs[0][0]);
        await assertAcquisitionSucceeded(versionPairs[0][1], pathResult, eventStream, context);
    });

    test('Acquire Version Multiple Times', async () => {
        const numAcquisitions = 3;
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker();

        for (let i = 0; i < numAcquisitions; i++) {
            const pathResult = await acquisitionWorker.acquire(versionPairs[0][0]);
            await assertAcquisitionSucceeded(versionPairs[0][1], pathResult, eventStream, context);
        }

        // AcquisitionInvoker was only called once
        const acquireEvents = eventStream.events.filter(event => event instanceof TestAcquireCalled);
        assert.lengthOf(acquireEvents, 1);
    });

    test('Acquire Multiple Versions and UninstallAll', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker();
        for (const version of versionPairs) {
            const pathRes = await acquisitionWorker.acquire(version[0]);
            await assertAcquisitionSucceeded(version[1], pathRes, eventStream, context);
        }
        await acquisitionWorker.uninstallAll();
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
    });

    test('Acquire and UninstallAll', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker();

        const pathRes = await acquisitionWorker.acquire(versionPairs[0][0]);
        await assertAcquisitionSucceeded(versionPairs[0][1], pathRes, eventStream, context);

        await acquisitionWorker.uninstallAll();
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
    });

    test('Repeated Acquisition', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker();
        for (let i = 0; i < 3; i ++) {
            await acquisitionWorker.acquire(versionPairs[0][0]);
        }
        // We should only actually acquire once
        const events = eventStream.events.filter(event => event instanceof DotnetAcquisitionStarted);
        assert.equal(events.length, 1);
      });
});
