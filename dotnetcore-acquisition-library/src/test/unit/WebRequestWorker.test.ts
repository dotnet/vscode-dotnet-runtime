/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { DotnetCoreAcquisitionWorker } from '../../DotnetCoreAcquisitionWorker';
import { DotnetAcquisitionError, DotnetInstallScriptAcquisitionError } from '../../EventStreamEvents';
import { IInstallScriptAcquisitionWorker } from '../../IInstallScriptAcquisitionWorker';
import {
    ErrorAcquisitionInvoker,
    MockEventStream,
    MockExtensionContext,
    MockInstallScriptWorker,
    MockVersionResolver,
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
        const acquisitionWorker = new DotnetCoreAcquisitionWorker('', context, eventStream,
            new ErrorAcquisitionInvoker(eventStream), new MockVersionResolver(context, eventStream));
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
});
