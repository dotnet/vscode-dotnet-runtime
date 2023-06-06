/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import { MockEventStream, MockExtensionContext, MockVersionResolver, versionPairs } from '../mocks/MockObjects';
import { IDotnetListVersionsResult } from '../../IDotnetListVersionsContext';
const assert = chai.assert;

suite('VersionResolver Unit Tests', () => {
    const eventStream = new MockEventStream();
    const context = new MockExtensionContext();
    // MockVersionResolver is a VersionResolver that uses a fake releases.json
    // (prevents us from making web requests in unit tests)
    const resolver: MockVersionResolver = new MockVersionResolver(context, eventStream);

    test('Get Available Versions', async () => {
        const result : IDotnetListVersionsResult = await resolver.GetAvailableDotnetVersions(undefined);
        // Assert that the call gives a result with members. The data may change, so we did not include data here.
        // Comprehensive e2e tests with data are in the sdk extension.
        assert(result);
        assert(result.length > 0); 
    });

    test('Error With Invalid Version', async () => {
        return assert.isRejected(resolver.getFullRuntimeVersion('foo'), Error, 'Invalid version');
    });

    test('Error With Three Part Version', async () => {
        return assert.isRejected(resolver.getFullRuntimeVersion('1.0.16'), Error, 'Invalid version');
    });

    test('Error With Invalid Major.Minor', async () => {
        return assert.isRejected(resolver.getFullRuntimeVersion('0.0'), Error, 'Unable to resolve version');
    });

    test('Resolve Valid Runtime Versions', async () => {
        for (const version of versionPairs) {
            assert.equal(await resolver.getFullRuntimeVersion(version[0]), version[1]);
        }
    });

    test('Resolve Latest SDK Version', async () => {
        assert.equal(await resolver.getFullSDKVersion('2.2'), '2.2.207');
    });
});
