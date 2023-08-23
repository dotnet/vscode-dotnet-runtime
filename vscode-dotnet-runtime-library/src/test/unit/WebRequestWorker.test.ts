/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as path from 'path';
import { DotnetCoreAcquisitionWorker } from '../../Acquisition/DotnetCoreAcquisitionWorker';
import { IInstallScriptAcquisitionWorker } from '../../Acquisition/IInstallScriptAcquisitionWorker';
import { RuntimeInstallationDirectoryProvider } from '../../Acquisition/RuntimeInstallationDirectoryProvider';
import {
    DotnetFallbackInstallScriptUsed,
    DotnetInstallScriptAcquisitionError,
} from '../../EventStream/EventStreamEvents';
import {
    ErrorAcquisitionInvoker,
    MockEventStream,
    MockExtensionContext,
    MockInstallationValidator,
    MockInstallScriptWorker,
    MockTrackingWebRequestWorker,
} from '../mocks/MockObjects';

import {
    Debugging
} from '../../Utils/Debugging';

const assert = chai.assert;
chai.use(chaiAsPromised);

const maxTimeoutTime = 10000;
// Website used for the sake of it returning the same response always (tm)
const staticWebsiteUrl = 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/2.1/releases.json';

suite('WebRequestWorker Unit Tests', () => {
    function getTestContext(): [MockEventStream, MockExtensionContext] {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        return [eventStream, context];
    }

    test('Acquire Version Network Failure', async () => {
        const [eventStream, context] = getTestContext();

        const acquisitionWorker = new DotnetCoreAcquisitionWorker({
            storagePath: '',
            extensionState: context,
            eventStream,
            acquisitionInvoker: new ErrorAcquisitionInvoker(eventStream),
            installationValidator: new MockInstallationValidator(eventStream),
            timeoutValue: 10,
            installDirectoryProvider: new RuntimeInstallationDirectoryProvider(''),
        });
        return assert.isRejected(acquisitionWorker.acquireRuntime('1.0'), Error, '.NET Acquisition Failed');
    });

    test('Install Script Request Failure', async () => {
        const [eventStream, context] = getTestContext();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(context, eventStream, true);
        await assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script');
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
    });

    test('Install Script Request Failure With Fallback Install Script', async () => {
        Debugging.log('Get Test Context.');
        const [eventStream, context] = getTestContext();

        Debugging.log('Instantiate Install Script Worker.');
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(context, eventStream, true, true);

        Debugging.log('Request the install script path.');
        const scriptPath = await installScriptWorker.getDotnetInstallScriptPath();

        Debugging.log('Asserting the path is as expected.');
        assert.equal(scriptPath, path.join(__dirname, '..'));

        Debugging.log('Scan the event stream events.');
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
        assert.exists(eventStream.events.find(event => event instanceof DotnetFallbackInstallScriptUsed));
    });

    test('Install Script File Manipulation Failure', async () => {
        const [eventStream, context] = getTestContext();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(context, eventStream, true);
        await assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script')
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
    });

    test('Web Requests Cached on Repeated calls', async () => {
        const [eventStream, context] = getTestContext();
        const webWorker = new MockTrackingWebRequestWorker(context, eventStream, staticWebsiteUrl);

        const uncachedResult = await webWorker.getCachedData();
        // The data should now be cached.
        const cachedResult = await webWorker.getCachedData();

        assert.exists(uncachedResult);
        assert.deepEqual(uncachedResult, cachedResult);

        const requestCount = webWorker.getRequestCount();
        assert.isAtMost(requestCount, 1);
    }).timeout(maxTimeoutTime);

    test('Web Requests Cached Does Not Live Forever', async () => {
        const [eventStream, context] = getTestContext();
        const cacheTimeoutTime = 1;
        const webWorker = new MockTrackingWebRequestWorker(context, eventStream, 'https://microsoft.com', true, maxTimeoutTime, cacheTimeoutTime);
        const uncachedResult = await webWorker.getCachedData();
        await new Promise(resolve => setTimeout(resolve, cacheTimeoutTime));
        const cachedResult = await webWorker.getCachedData();
        assert.exists(uncachedResult);
        const requestCount = webWorker.getRequestCount();
        assert.isAtLeast(requestCount, 2);
    }).timeout((maxTimeoutTime*5) + 2000);
});

