/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as os from 'os';
import * as path from 'path';
import { DotnetCoreAcquisitionWorker } from '../../DotnetCoreAcquisitionWorker';
import { MockExtensionContext,
    MockEventStream,
    NoInstallAcquisitionInvoker,
    MockVersionResolver,
    ErrorAcquisitionInvoker,
    versionPairs
} from '../mocks/MockObjects';
import { EventType } from '../../EventType';
import { 
    DotnetAcquisitionStarted,
    DotnetAcquisitionCompleted,
    TestAcquireCalled,
    DotnetUninstallAllStarted,
    DotnetUninstallAllCompleted
} from '../../EventStreamEvents';
var chai = require('chai');
var assert = chai.assert;
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

suite("DotnetCoreAcquisitionWorker Unit Tests", function () {
    const installingVersionsKey = 'installing';

    function getTestAcquisitionWorker(fakeScripts: boolean) : [ DotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext ] {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const acquisitionWorker = new DotnetCoreAcquisitionWorker(
            "",
            context,
            eventStream,
            fakeScripts ? 
                new ErrorAcquisitionInvoker(eventStream) : 
                new NoInstallAcquisitionInvoker(eventStream), 
            new MockVersionResolver(context, eventStream));
        return [ acquisitionWorker, eventStream, context ];
    }
    
    function getExpectedPath(version: string) : string {
        return path.join(".dotnet", version, os.platform() === 'win32' ? "dotnet.exe" : "dotnet");
    }
    
    async function assertAcquisitionSucceeded(version: string,
        exePath: string,
        eventStream : MockEventStream,
        context : MockExtensionContext) {
        var expectedPath = getExpectedPath(version);

        // Path to exe should be correct
        assert.equal(exePath, expectedPath);

        // Should be finished installing
        assert.isEmpty(context.get(installingVersionsKey));

        // No errors in event stream
        assert.notExists(eventStream.events.find(event => event.type == EventType.DotnetAcquisitionError));
        var startEvent = eventStream.events
            .find(event => event instanceof DotnetAcquisitionStarted && (event as DotnetAcquisitionStarted).version == version);
        assert.exists(startEvent);
        var completedEvent = eventStream.events
            .find(event => event instanceof DotnetAcquisitionCompleted && (event as DotnetAcquisitionCompleted).version == version 
            && (event as DotnetAcquisitionCompleted).dotnetPath == expectedPath);
        assert.exists(completedEvent);

        // Acquire got called with the correct args
        var acquireEvent = eventStream.events.find(event => 
            event instanceof TestAcquireCalled && (event as TestAcquireCalled).context.version == version) as TestAcquireCalled;
        assert.exists(acquireEvent);
        assert.equal(acquireEvent!.context.dotnetPath, expectedPath);
        assert.equal(acquireEvent!.context.installDir, path.join(".dotnet", version));
    }

    test("Acquire Version", async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(false);

        const path = await acquisitionWorker.acquire(versionPairs[0][0]);
        await assertAcquisitionSucceeded(versionPairs[0][1], path, eventStream, context);
    });

    test("Acquire Version Multiple Times", async () => {
        const numAcquisitions = 3;
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(false);

        for (let i = 0; i < numAcquisitions; i++) {
            const path = await acquisitionWorker.acquire(versionPairs[0][0]);
            await assertAcquisitionSucceeded(versionPairs[0][1], path, eventStream, context);
        }

        // AcquisitionInvoker was only called once
        var acquireEvents = eventStream.events.filter(event => event instanceof TestAcquireCalled);
        assert.lengthOf(acquireEvents, 1);
    });

    test('Acquire Version Network Failure', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);
        return assert.isRejected(acquisitionWorker.acquire(versionPairs[0][0]), Error, 'Dotnet Core Acquisition Failed');
    });

    test("Acquire Multiple Versions and UninstallAll", async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(false);
        for (var version of versionPairs) {
            const path = await acquisitionWorker.acquire(version[0]);
            await assertAcquisitionSucceeded(version[1], path, eventStream, context);
        }
        await acquisitionWorker.uninstallAll();
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
    });

    test("Acquire and UninstallAll", async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(false);

        const path = await acquisitionWorker.acquire(versionPairs[0][0]);
        await assertAcquisitionSucceeded(versionPairs[0][1], path, eventStream, context);

        await acquisitionWorker.uninstallAll();
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
    });
});