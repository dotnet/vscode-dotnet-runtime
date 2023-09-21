/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/import * as chai from 'chai';
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

        assert(result);
        assert(result.length > 0);
        assert(result.some(x => x.version === '2.2.207')); // this is one of the versions we'd expect to be available.
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
