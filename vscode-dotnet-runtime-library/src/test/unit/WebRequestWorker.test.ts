/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';

import * as chaiAsPromised from 'chai-as-promised';
import * as path from 'path';
import { DotnetCoreAcquisitionWorker } from '../../Acquisition/DotnetCoreAcquisitionWorker';
import { IInstallScriptAcquisitionWorker } from '../../Acquisition/IInstallScriptAcquisitionWorker';
import
{
    DotnetFallbackInstallScriptUsed,
    DotnetInstallScriptAcquisitionError,
    OfflineDetectionLogicTriggered,
    WebRequestTime,
} from '../../EventStream/EventStreamEvents';
import
{
    ErrorAcquisitionInvoker,
    MockEventStream,
    MockInstallScriptWorker,
    MockInstallTracker,
    MockTrackingWebRequestWorker,
    MockVSCodeExtensionContext,
} from '../mocks/MockObjects';

import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';

const assert = chai.assert;
chai.use(chaiAsPromised);

const maxTimeoutTime = 10000;
// Website used for the sake of it returning the same response always (tm)
const staticWebsiteUrl = 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/2.1/releases.json';

// A WebRequestWorkerSingleton whose hostname resolution for isOnline() is fully controlled by the test,
// so we don't depend on real DNS (which is exactly what the c-ares resolver incorrectly fails on).
class MockOnlineWebRequestWorker extends WebRequestWorkerSingleton
{
    public resolvedAddress: string | undefined = '1.2.3.4';
    public shouldThrow = false;

    constructor()
    {
        super();
        const _ = WebRequestWorkerSingleton.getInstance(); // cause super to exist
    }

    protected async resolveHostnameForOnlineCheck(hostName: string, timeoutMs: number): Promise<string | undefined>
    {
        if (this.shouldThrow)
        {
            throw new Error('ENOTFOUND test');
        }
        return this.resolvedAddress;
    }
}

suite('WebRequestWorker Unit Tests', function ()
{
    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('Acquire Version Network Failure', async () =>
    {
        const eventStream = new MockEventStream();
        const mockContext = getMockAcquisitionContext('runtime', '1.0', undefined, eventStream);
        const acquisitionWorker = new DotnetCoreAcquisitionWorker(getMockUtilityContext(), new MockVSCodeExtensionContext());
        const invoker = new ErrorAcquisitionInvoker(eventStream);
        const tracker = new MockInstallTracker(eventStream, mockContext.extensionState);

        try
        {
            await assert.isRejected(acquisitionWorker.acquireLocalRuntime(mockContext, invoker), Error, 'Command Failed');
        }
        finally
        {
            await tracker.endAnySingletonTrackingSessions();
        }
    }).timeout(maxTimeoutTime);

    test('Install Script Request Failure', async () =>
    {
        const eventStream = new MockEventStream();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(getMockAcquisitionContext('runtime', '', undefined, eventStream), true);
        await assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script');
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
    });

    test('Install Script Request Failure With Fallback Install Script', async () =>
    {
        const eventStream = new MockEventStream();

        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(getMockAcquisitionContext('runtime', '', undefined, eventStream), true, true);

        const scriptPath = await installScriptWorker.getDotnetInstallScriptPath();

        assert.equal(scriptPath, path.join(__dirname, '..'));

        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
        assert.exists(eventStream.events.find(event => event instanceof DotnetFallbackInstallScriptUsed));
    });

    test('Install Script File Manipulation Failure', async () =>
    {
        const eventStream = new MockEventStream();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(getMockAcquisitionContext('runtime', '', undefined, eventStream), true);
        await assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script')
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
    });

    test('Web Requests Cached on Repeated calls', async () =>
    {
        const ctx = getMockAcquisitionContext('runtime', '');
        const webWorker = new MockTrackingWebRequestWorker();

        const uncachedResult = await webWorker.getCachedData(staticWebsiteUrl, ctx);
        // The data should now be cached.
        const cachedResult = await webWorker.getCachedData(staticWebsiteUrl, ctx);

        assert.exists(uncachedResult);
        assert.deepEqual(uncachedResult, cachedResult);

        const requestCount = webWorker.getRequestCount();
        assert.isAtMost(requestCount, 1);
    }).timeout(maxTimeoutTime);

    test('Web Requests Cached Does Not Live Forever', async () =>
    {
        const ctx = getMockAcquisitionContext('runtime', '');
        const uri = 'https://microsoft.com';

        const webWorker = new MockTrackingWebRequestWorker(true);
        // Force a short, deterministic cache TTL and stop interpreting the server's cache headers
        // (which set ~10 minute max-age and would make the entry outlive the test's 120s wait).
        const cacheOptions = { cache: { ttl: 2000, interpretHeader: false } };
        const uncachedResult = await webWorker.getCachedData(uri, ctx, 2, cacheOptions);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const cachedResult = await webWorker.getCachedData(uri, ctx, 2, cacheOptions);
        assert.exists(uncachedResult);
        const requestCount = webWorker.getRequestCount();
        assert.isAtLeast(requestCount, 2);
    }).timeout(maxTimeoutTime * 7);

    test('It actually times requests', async () =>
    {
        const eventStream = new MockEventStream();
        const ctx = getMockAcquisitionContext('runtime', '', 600, eventStream);
        const webWorker = new MockTrackingWebRequestWorker();

        const _ = await webWorker.getCachedData(staticWebsiteUrl, ctx);
        const timerEvents = eventStream.events.find(event => event instanceof WebRequestTime);
        assert.exists(timerEvents, 'There exist WebRequestTime Events');
        assert.equal(timerEvents?.finished, 'true', 'The timed event time finished');
        assert.isTrue(Number(timerEvents?.durationMs) > 0, 'The timed event time is > 0');
        assert.isTrue(String(timerEvents?.status).startsWith('2'), 'The timed event has a status 2XX');
    }).timeout(maxTimeoutTime);

    test('isOnline returns true when the hostname resolves', async () =>
    {
        const eventStream = new MockEventStream();
        const worker = new MockOnlineWebRequestWorker();
        worker.resolvedAddress = '1.2.3.4';
        assert.isTrue(await worker.isOnline(600, eventStream));
        assert.isEmpty(eventStream.events.filter(event => event instanceof OfflineDetectionLogicTriggered));
    });

    test('isOnline returns false and reports an event when the hostname does not resolve', async () =>
    {
        const eventStream = new MockEventStream();
        const worker = new MockOnlineWebRequestWorker();
        worker.resolvedAddress = undefined;
        assert.isFalse(await worker.isOnline(600, eventStream));
        assert.exists(eventStream.events.find(event => event instanceof OfflineDetectionLogicTriggered));
    });

    test('isOnline reports an event when DNS lookup errors', async () =>
    {
        const eventStream = new MockEventStream();
        const worker = new MockOnlineWebRequestWorker();
        worker.shouldThrow = true;
        assert.isFalse(await worker.isOnline(600, eventStream));
        assert.exists(eventStream.events.find(event => event instanceof OfflineDetectionLogicTriggered));
    });

    test('isOnline returns false when DOTNET_INSTALL_TOOL_OFFLINE is set', async () =>
    {
        const eventStream = new MockEventStream();
        const worker = new MockOnlineWebRequestWorker();
        worker.resolvedAddress = '1.2.3.4';
        process.env.DOTNET_INSTALL_TOOL_OFFLINE = '1';
        try
        {
            assert.isFalse(await worker.isOnline(600, eventStream));
        }
        finally
        {
            delete process.env.DOTNET_INSTALL_TOOL_OFFLINE;
        }
    });
});

