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
    MockWebRequestWorker,
} from '../mocks/MockObjects';

const assert = chai.assert;
chai.use(chaiAsPromised);



suite('WebRequestWorker Unit Tests', () => {
    function getTestContext(): [MockEventStream, MockExtensionContext] {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        return [eventStream, context];
    }

    test('Acquire Version Network Failure', async () => {
        const [eventStream, context] = getTestContext();

        const acquisitionWorker = new DotnetCoreAcquisitionWorker({
            storagePath: '',
            extensionState: context,
            eventStream,
            acquisitionInvoker: new ErrorAcquisitionInvoker(eventStream),
            installationValidator: new MockInstallationValidator(eventStream),
            timeoutValue: 10,
            installDirectoryProvider: new RuntimeInstallationDirectoryProvider(''),
        });
        return assert.isRejected(acquisitionWorker.acquireRuntime('1.0'), Error, '.NET Acquisition Failed');
    });

    test('Install Script Request Failure', async () => {
        const [eventStream, context] = getTestContext();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(context, eventStream, true);
        return assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script').then(() => {
            assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
        });
    });

    test('Install Script Request Failure With Fallback Install Script', async () => {
        const [eventStream, context] = getTestContext();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(context, eventStream, true, true);
        const scriptPath = await installScriptWorker.getDotnetInstallScriptPath();
        assert.equal(scriptPath, path.join(__dirname, '..'));
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
        assert.exists(eventStream.events.find(event => event instanceof DotnetFallbackInstallScriptUsed));
    });

    test('Install Script File Manipulation Failure', async () => {
        const [eventStream, context] = getTestContext();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(context, eventStream, true);
        return assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script').then(() => {
            assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
        });
    });

    test('Web Requests Cached on Repeated calls', async () => {
        const [eventStream, context] = getTestContext();
        const webWorker = new MockTrackingWebRequestWorker(context, eventStream, 'https://microsoft.com');

        // Make a request to cache the data.
        var uncachedResult = await webWorker.getCachedData(0);
        // The data should now be cached.
        var cachedResult = await webWorker.getCachedData(0);

        assert.exists(uncachedResult);
        assert.equal(uncachedResult, cachedResult);

        const requestCount = webWorker.getRequestCount();
        assert.isBelow(requestCount, 1);
    });

    test('Web Requests are Retried', async () => {
        const [eventStream, context] = getTestContext();
        const webWorker = new MockWebRequestWorker(context, eventStream, '', false);

        const retryCount = 1;
        await assert.isRejected(webWorker.getCachedData(retryCount));
        const requestCount = webWorker.getRequestCount();
        assert.equal(requestCount, retryCount + 1);
    }).timeout(3000);
});
