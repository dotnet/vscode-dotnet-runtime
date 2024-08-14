/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { MockEventStream, MockExtensionContext, MockVersionResolver, versionPairs } from '../mocks/MockObjects';
import { IDotnetListVersionsResult } from '../../IDotnetListVersionsContext';
import { VersionResolver } from '../../Acquisition/VersionResolver';
import { getMockAcquisitionContext } from './TestUtility';
const assert = chai.assert;
const fullySpecifiedVersion = '7.0.201';
const twoDigitPatchVersion = '7.0.221';
const uniqueMajorMinorVersion = '7.1.300';
const twoDigitMajorVersion = '10.0.102';
const featureBandVersion = '7.0.2xx';
const majorOnly = '7';
const majorMinorOnly = '7.0';

const badSDKVersionPeriods = '10.10';
const badSDKVersionPatch = '7.1.10';
const badSDKVersionLongPatch = '7.0.1999';

suite('VersionResolver Unit Tests', () => {
    // MockVersionResolver is a VersionResolver that uses a fake releases.json
    // (prevents us from making web requests in unit tests)
    const resolver: MockVersionResolver = new MockVersionResolver(getMockAcquisitionContext('runtime', ''));

    test('Get Available Versions', async () => {
        const result : IDotnetListVersionsResult = await resolver.GetAvailableDotnetVersions(undefined);

        assert(result);
        assert(result.length > 0);
        assert(result.some(x => x.version === '2.2.207')); // this is one of the versions we'd expect to be available.
    });

    test('Error With Invalid Version', async () => {
        assert.isRejected(resolver.getFullVersion('foo', 'runtime'), Error, 'Invalid version');
    });

    test('Error With Three Part Version', async () => {
        assert.isRejected(resolver.getFullVersion('1.0.16', 'runtime'), Error, 'Invalid version');
    });

    test('Error With Invalid Major.Minor', async () => {
        assert.isRejected(resolver.getFullVersion('0.0', 'runtime'), Error, 'Unable to resolve version');
    });

    test('Resolve Valid Runtime Versions', async () => {
        for (const version of versionPairs) {
            assert.equal(await resolver.getFullVersion(version[0], 'runtime'), version[1]);
        }
    });

    test('Resolve Latest SDK Version', async () => {
        assert.equal(await resolver.getFullVersion('2.2', 'sdk'), '2.2.207');
    });
});

