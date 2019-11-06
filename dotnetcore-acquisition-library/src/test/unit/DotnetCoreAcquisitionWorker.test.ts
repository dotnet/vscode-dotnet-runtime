import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { DotnetCoreAcquisitionWorker } from '../../DotnetCoreAcquisitionWorker';
import { MockExtensionContext, MockEventStream } from './MockObjects';
import { EventType } from '../../EventType';
import { DotnetAcquisitionStarted, DotnetAcquisitionCompleted } from '../../EventStreamEvents';
import rimraf = require('rimraf');
var assert = require('chai').assert;

suite("DotnetCoreAcquisitionWorker Unit Tests", function () {
    const installingVersionsKey = 'installing';
    const testStorage = path.join(__dirname, "tmp");

    function getTestAcquisitionWorker(fakeScript : boolean) : [ DotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext ] {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const acquisitionWorker = new DotnetCoreAcquisitionWorker(
            "",
            testStorage,
            context,
            eventStream, 
            fakeScript ? __dirname + "/../../../src/test/scripts/mock-dotnet-install" : // Mock script
                __dirname + "/../../../scripts/dotnet-install"); // Real script
        return [ acquisitionWorker, eventStream, context ];
    }
    
    function getExpectedPath(version: string) : string {
        return path.join(__dirname, "tmp", ".dotnet", version, os.platform() === 'win32' ? "dotnet.exe" : "dotnet");
    }
    
    async function assertAcquisitionSucceeded(version: string,
        path: string,
        eventStream : MockEventStream,
        context : MockExtensionContext) {
            // Path to exe should be correct
            assert.equal(path, getExpectedPath(version));
    
            // Should be finished installing
            assert.isEmpty(context.get(installingVersionsKey));
    
            // No errors in event stream
            assert.notExists(eventStream.events.find(event => event.type == EventType.DotnetAcquisitionError));
            var startEvent = eventStream.events.find(event => event.type == EventType.DotnetAcquisitionStart);
            var completeEvent = eventStream.events.find(event => event.type == EventType.DotnetAcquisitionCompleted);
            assert.isDefined(startEvent);
            assert.isDefined(completeEvent);
            assert.deepEqual(startEvent, new DotnetAcquisitionStarted(version));
            assert.deepEqual(completeEvent, new DotnetAcquisitionCompleted(version, getExpectedPath(version)));
    }

    test("Acquire Specific Version", async () => {
        const version = "1.0.16";

        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);

        const path = await acquisitionWorker.acquire(version);
        await assertAcquisitionSucceeded(version, path, eventStream, context);
    });

    test("Acquire Major.Minor Version", async () => {
        const version = ["1.0", "1.0.16"]; // [band, most recent in band]

        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(true);

        const path = await acquisitionWorker.acquire(version[0]);
        await assertAcquisitionSucceeded(version[1], path, eventStream, context);
    });

    test("Acquire and UninstallAll Single Version", async () => {
        const version = "1.0.16";

        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(false);

        const path = await acquisitionWorker.acquire(version);
        await assertAcquisitionSucceeded(version, path, eventStream, context);
        assert.isTrue(fs.existsSync(path));

        await acquisitionWorker.uninstallAll();
        assert.isEmpty(fs.readdirSync(testStorage));
    }).timeout(10000);

    test("Acquire and UninstallAll Multiple Versions", async () => {
        const versions = ['1.0.16', '1.1.13', '2.0.9'];

        const [acquisitionWorker, eventStream, context] = getTestAcquisitionWorker(false);

        for (const version of versions) {
            const path = await acquisitionWorker.acquire(version);
            await assertAcquisitionSucceeded(version, path, eventStream, context);
            assert.isTrue(fs.existsSync(path));
            eventStream.events = []; // clear events for next acquisition
        }

        await acquisitionWorker.uninstallAll();
        assert.isEmpty(fs.readdirSync(testStorage));
    }).timeout(20000);

    this.afterAll(function() {
        // Clean up temp storage
        rimraf.sync(testStorage);
    });

    // TODO change this so the mock script makes the file we expect, just empty. 
});