import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { DotnetCoreAcquisitionWorker } from '../DotnetCoreAcquisitionWorker';
import { MockExtensionContext, MockEventStream } from './MockObjects';
import { EventType } from '../EventType';
import { DotnetAcquisitionStarted, DotnetAcquisitionCompleted } from '../EventStreamEvents';

suite("DotnetCoreAcquisitionWorker: Acquire", function () {
    test("Acquire", async () => {
        const version = "1.0.16";
        const expectedPath = path.join(".dotnet", "1.0.16", os.platform() === 'win32' ? "dotnet.exe" : "dotnet");

        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const acquisitionWorker = new DotnetCoreAcquisitionWorker(
            "",
            "",
            context,
            eventStream, 
            __dirname + "/../../src/test/scripts"); // path to fake script

        const res = await acquisitionWorker.acquire(version);
        assert.equal(res, expectedPath);

        // Should be finished installing
        assert.deepEqual(context.get(acquisitionWorker.installingVersionsKey), []);

        // No errors in event stream
        assert.equal(eventStream.events.length, 2);
        var startEvent = eventStream.events.find(event => event.type == EventType.DotnetAcquisitionStart);
        var completeEvent = eventStream.events.find(event => event.type == EventType.DotnetAcquisitionCompleted);
        assert.notEqual(startEvent, undefined);
        assert.notEqual(completeEvent, undefined);
        assert.deepEqual(startEvent, new DotnetAcquisitionStarted(version));
        assert.deepEqual(completeEvent, new DotnetAcquisitionCompleted(version, expectedPath));
    })
});