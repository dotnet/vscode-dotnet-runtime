/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as os from 'os';
import * as path from 'path';
import { DotnetCoreAcquisitionWorker } from '../../Acquisition/DotnetCoreAcquisitionWorker';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionStarted,
    DotnetUninstallAllCompleted,
    DotnetUninstallAllStarted,
    TestAcquireCalled,
} from '../../EventStream/EventStreamEvents';
import { EventType } from '../../EventStream/EventType';
import {
    MockEventStream,
    MockExtensionContext,
    MockInstallationValidator,
    MockVersionResolver,
    NoInstallAcquisitionInvoker,
    versionPairs,
} from '../mocks/MockObjects';
const assert = chai.assert;
chai.use(chaiAsPromised);

suite('DotnetCoreAcquisitionWorker Unit Tests', function() {
    const installingVersionsKey = 'installing';
    const dotnetFolderName = `.dotnet O'Hare O'Donald`;

    function getTestAcquisitionWorker(): [ DotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext ] {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const acquisitionWorker = new DotnetCoreAcquisitionWorker({
            storagePath: '',
            extensionState: context,
            eventStream,

            acquisitionInvoker: new NoInstallAcquisitionInvoker(eventStream),
            versionResolver: new MockVersionResolver(context, eventStream),
            installationValidator: new MockInstallationValidator(eventStream),
        });
        return [ acquisitionWorker, eventStream, context ];
    }

    function getExpectedPath(version: string): string {
        return path.join(dotnetFolderName, version, os.platform() === 'win32' ? 'dotnet.exe' : 'dotnet');
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
        assert.equal(acquireEvent!.context.installDir, path.join(dotnetFolderName, version));
    }

    this.beforeAll(async () => {
        process.env.VSCODE_DOTNET_INSTALL_FOLDER = dotnetFolderName;
    });

    test('Acquire Version', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker();

        const result = await acquisitionWorker.acquire(versionPairs[0][0]);
        await assertAcquisitionSucceeded(versionPairs[0][1], result.dotnetPath, eventStream, context);
    });

    test('Acquire Version Multiple Times', async () => {
        const numAcquisitions = 3;
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker();

        for (let i = 0; i < numAcquisitions; i++) {
            const pathResult = await acquisitionWorker.acquire(versionPairs[0][0]);
            await assertAcquisitionSucceeded(versionPairs[0][1], pathResult.dotnetPath, eventStream, context);
        }

        // AcquisitionInvoker was only called once
        const acquireEvents = eventStream.events.filter(event => event instanceof TestAcquireCalled);
        assert.lengthOf(acquireEvents, 1);
    });

    test('Acquire Multiple Versions and UninstallAll', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker();
        for (const version of versionPairs) {
            const res = await acquisitionWorker.acquire(version[0]);
            await assertAcquisitionSucceeded(version[1], res.dotnetPath, eventStream, context);
        }
        await acquisitionWorker.uninstallAll();
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllStarted));
        assert.exists(eventStream.events.find(event => event instanceof DotnetUninstallAllCompleted));
    });

    test('Acquire and UninstallAll', async () => {
        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker();

        const res = await acquisitionWorker.acquire(versionPairs[0][0]);
        await assertAcquisitionSucceeded(versionPairs[0][1], res.dotnetPath, eventStream, context);

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
