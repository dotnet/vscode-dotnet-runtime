/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as os from 'os';
import * as path from 'path';
import { DotnetCoreAcquisitionWorker } from '../../DotnetCoreAcquisitionWorker';
import { MockExtensionContext, MockEventStream, NoInstallAcquisitionInvoker, MockVersionResolver, latestVersionMap } from './MockObjects';
import { EventType } from '../../EventType';
import { DotnetAcquisitionStarted, DotnetAcquisitionCompleted, TestAcquireCalled, DotnetUninstallAllStarted, DotnetUninstallAllCompleted } from '../../EventStreamEvents';
var assert = require('chai').assert;

suite("DotnetCoreAcquisitionWorker Unit Tests", function () {
    const installingVersionsKey = 'installing';

    function getTestAcquisitionWorker() : [ DotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext ] {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const acquisitionWorker = new DotnetCoreAcquisitionWorker(
            "",
            context,
            eventStream,
            new NoInstallAcquisitionInvoker(eventStream), 
            new MockVersionResolver());
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

        // No errors in event stream
        assert.notExists(eventStream.events.find(event => event.type == EventType.DotnetAcquisitionError));
        var startEvent = eventStream.events.find(event => event.type == EventType.DotnetAcquisitionStart);
        var completeEvent = eventStream.events.find(event => event.type == EventType.DotnetAcquisitionCompleted);
        assert.isDefined(startEvent);
        assert.isDefined(completeEvent);
        assert.deepEqual(startEvent, new DotnetAcquisitionStarted(version));
        assert.deepEqual(completeEvent, new DotnetAcquisitionCompleted(version, expectedPath));

        // Acquire got called with the correct args
        var acquireEvent = eventStream.events.find(event => event instanceof TestAcquireCalled) as TestAcquireCalled;
        assert.exists(acquireEvent);
        assert.equal(acquireEvent!.context.dotnetPath, expectedPath);
        assert.equal(acquireEvent!.context.installDir, path.join(".dotnet", version));
        assert.equal(acquireEvent!.context.version, version);
    }

    test("Acquire Version", async () => {
        const version = "1.0";
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker();

        const path = await acquisitionWorker.acquire(version);
        await assertAcquisitionSucceeded(latestVersionMap[version]!, path, eventStream, context);
    });

    test("Acquire and UninstallAll", async () => {
        const version = "1.0";
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker();

        const path = await acquisitionWorker.acquire(version);
        await assertAcquisitionSucceeded(latestVersionMap[version]!, path, eventStream, context);

        await acquisitionWorker.uninstallAll();
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
    });
});