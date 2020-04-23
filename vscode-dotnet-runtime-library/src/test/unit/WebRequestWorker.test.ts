/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { DotnetCoreAcquisitionWorker } from '../../Acquisition/DotnetCoreAcquisitionWorker';
import { IInstallScriptAcquisitionWorker } from '../../Acquisition/IInstallScriptAcquisitionWorker';
import { DotnetInstallScriptAcquisitionError } from '../../EventStream/EventStreamEvents';
import {
    ErrorAcquisitionInvoker,
    MockEventStream,
    MockExtensionContext,
    MockInstallationValidator,
    MockInstallScriptWorker,
    MockVersionResolver,
    MockWebRequestWorker,
    versionPairs,
} from '../mocks/MockObjects';
const assert = chai.assert;
chai.use(chaiAsPromised);

suite('WebRequestWorker Unit Tests', () => {
    function getTestContext(): [ MockEventStream, MockExtensionContext ] {
        const context = new MockExtensionContext();
        const eventStream = new MockEventStream();
        return [ eventStream, context ];
    }

    test('Acquire Version Network Failure', async () => {
        const [eventStream, context] = getTestContext();

        const acquisitionWorker = new DotnetCoreAcquisitionWorker({
            storagePath: '',
            extensionState: context,
            eventStream,
            acquisitionInvoker: new ErrorAcquisitionInvoker(eventStream),
            versionResolver: new MockVersionResolver(context, eventStream),
            installationValidator: new MockInstallationValidator(eventStream),
            timeoutValue: 10,
        });
        return assert.isRejected(acquisitionWorker.acquire(versionPairs[0][0]), Error, 'Dotnet Core Acquisition Failed');
    });

    test('Install Script Request Failure', async () => {
        const [eventStream, context] = getTestContext();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(context, eventStream, true);
        return assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script').then(() => {
            assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
        });
    });

    test('Install Script File Manipulation Failure', async () => {
        const [eventStream, context] = getTestContext();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(context, eventStream, true);
        return assert.isRejected(installScriptWorker.getDotnetInstallScriptPath(), Error, 'Failed to Acquire Dotnet Install Script').then(() => {
            assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
        });
    });

    test('Web Requests Memoized on Repeated Installs', async () => {
        const [eventStream, context] = getTestContext();
        const webWorker = new MockWebRequestWorker(context, eventStream, '', 'MockKey');
        // Make a request to cache the data
        await webWorker.getCachedData();
        const requests = [];
        for (let i = 0; i < 10; i++) {
            requests.push(webWorker.getCachedData());
        }
        for (const request of requests) {
            assert.equal(await request, 'Mock Web Request Result');
        }
        const requestCount = webWorker.getRequestCount();
        assert.isBelow(requestCount, requests.length);
    });
});
