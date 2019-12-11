/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import { MockEventStream, MockExtensionContext, MockVersionResolver, versionPairs } from '../mocks/MockObjects';
const assert = chai.assert;

suite('VersionResolver Unit Tests', () => {
    const eventStream = new MockEventStream();
    const context = new MockExtensionContext();
    // MockVersionResolver is a VersionResolver that uses a fake releases.json
    // (prevents us from making web requests in unit tests)
    const resolver: MockVersionResolver = new MockVersionResolver(context, eventStream);

    test('Error With Invalid Version', async () => {
        return assert.isRejected(resolver.getFullVersion('foo'), Error, 'Invalid version');
    });

    test('Error With Three Part Version', async () => {
        return assert.isRejected(resolver.getFullVersion('1.0.16'), Error, 'Invalid version');
    });

    test('Error With Invalid Major.Minor', async () => {
        return assert.isRejected(resolver.getFullVersion('0.0'), Error, 'Unable to resolve version');
    });

    test('Resolve Valid Versions', async () => {
        for (const version of versionPairs) {
            assert.equal(await resolver.getFullVersion(version[0]), version[1]);
        }
    });
});
