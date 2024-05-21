/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';

import * as chaiAsPromised from 'chai-as-promised';
import * as path from 'path';
import { DotnetCoreAcquisitionWorker } from '../../Acquisition/DotnetCoreAcquisitionWorker';
import { IInstallScriptAcquisitionWorker } from '../../Acquisition/IInstallScriptAcquisitionWorker';
import {
    DotnetFallbackInstallScriptUsed,
    DotnetInstallScriptAcquisitionError,
} from '../../EventStream/EventStreamEvents';
import {
    ErrorAcquisitionInvoker,
    MockEventStream,
    MockInstallScriptWorker,
    MockTrackingWebRequestWorker,
    MockVSCodeExtensionContext,
} from '../mocks/MockObjects';

import {
    Debugging
} from '../../Utils/Debugging';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';

const assert = chai.assert;
chai.use(chaiAsPromised);

const maxTimeoutTime = 10000;
// Website used for the sake of it returning the same response always (tm)
const staticWebsiteUrl = 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/2.1/releases.json';

suite('WebRequestWorker Unit Tests', () => {
    test('Acquire Version Network Failure', async () => {
        const eventStream = new MockEventStream();
        const acquisitionWorker = new DotnetCoreAcquisitionWorker(getMockAcquisitionContext(true, '', undefined, eventStream), getMockUtilityContext(), new MockVSCodeExtensionContext());
        const invoker = new ErrorAcquisitionInvoker(eventStream);
        return assert.isRejected(acquisitionWorker.acquireRuntime('1.0', invoker), Error, '.NET Acquisition Failed');
    }).timeout(maxTimeoutTime);

    test('Install Script Request Failure', async () => {
        const eventStream = new MockEventStream();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(getMockAcquisitionContext(true, '', undefined, eventStream), true);
        await assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script');
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
    });

    test('Install Script Request Failure With Fallback Install Script', async () => {
        Debugging.log('Get Test Context.');
        const eventStream = new MockEventStream();

        Debugging.log('Instantiate Install Script Worker.');
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(getMockAcquisitionContext(true, '', undefined, eventStream), true, true);

        Debugging.log('Request the install script path.');
        const scriptPath = await installScriptWorker.getDotnetInstallScriptPath();

        Debugging.log('Asserting the path is as expected.');
        assert.equal(scriptPath, path.join(__dirname, '..'));

        Debugging.log('Scan the event stream events.');
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
        assert.exists(eventStream.events.find(event => event instanceof DotnetFallbackInstallScriptUsed));
    });

    test('Install Script File Manipulation Failure', async () => {
        const eventStream = new MockEventStream();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(getMockAcquisitionContext(true, '', undefined, eventStream), true);
        await assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script')
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
    });

    test('Web Requests Cached on Repeated calls', async () => {
        const webWorker = new MockTrackingWebRequestWorker(getMockAcquisitionContext(true, ''), staticWebsiteUrl);

        const uncachedResult = await webWorker.getCachedData();
        // The data should now be cached.
        const cachedResult = await webWorker.getCachedData();

        assert.exists(uncachedResult);
        assert.deepEqual(uncachedResult, cachedResult);

        const requestCount = webWorker.getRequestCount();
        assert.isAtMost(requestCount, 1);
    }).timeout(maxTimeoutTime);

    test('Web Requests Cached Does Not Live Forever', async () => {
        const cacheTimeoutTime = 1;
        const webWorker = new MockTrackingWebRequestWorker(getMockAcquisitionContext(true, ''), 'https://microsoft.com', true, cacheTimeoutTime);
        const uncachedResult = await webWorker.getCachedData();
        await new Promise(resolve => setTimeout(resolve, cacheTimeoutTime));
        const cachedResult = await webWorker.getCachedData();
        assert.exists(uncachedResult);
        const requestCount = webWorker.getRequestCount();
        assert.isAtLeast(requestCount, 2);
    }).timeout((maxTimeoutTime*7) + 2000);
});

