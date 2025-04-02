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
    WebRequestTime,
} from '../../EventStream/EventStreamEvents';
import
{
    ErrorAcquisitionInvoker,
    MockEventStream,
    MockInstallScriptWorker,
    MockTrackingWebRequestWorker,
    MockVSCodeExtensionContext,
} from '../mocks/MockObjects';

import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import
{
    Debugging
} from '../../Utils/Debugging';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';

const assert = chai.assert;
chai.use(chaiAsPromised);

const maxTimeoutTime = 10000;
// Website used for the sake of it returning the same response always (tm)
const staticWebsiteUrl = 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/2.1/releases.json';

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
        assert.isRejected(acquisitionWorker.acquireLocalRuntime(mockContext, invoker), Error, '.NET Acquisition Failed');
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
        Debugging.log('Get Test Context.');
        const eventStream = new MockEventStream();

        Debugging.log('Instantiate Install Script Worker.');
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(getMockAcquisitionContext('runtime', '', undefined, eventStream), true, true);

        Debugging.log('Request the install script path.');
        const scriptPath = await installScriptWorker.getDotnetInstallScriptPath();

        Debugging.log('Asserting the path is as expected.');
        assert.equal(scriptPath, path.join(__dirname, '..'));

        Debugging.log('Scan the event stream events.');
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
        const uncachedResult = await webWorker.getCachedData(uri, ctx);
        await new Promise(resolve => setTimeout(resolve, 120000));
        const cachedResult = await webWorker.getCachedData(uri, ctx);
        assert.exists(uncachedResult);
        const requestCount = webWorker.getRequestCount();
        assert.isAtLeast(requestCount, 2);
    }).timeout((maxTimeoutTime * 7) + 120000);

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
    });
});

