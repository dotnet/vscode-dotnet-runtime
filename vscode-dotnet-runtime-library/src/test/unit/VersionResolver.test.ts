/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { IDotnetListVersionsResult } from '../../IDotnetListVersionsContext';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockVersionResolver, versionPairs } from '../mocks/MockObjects';
import { getMockAcquisitionContext } from './TestUtility';
const assert = chai.assert;

suite('VersionResolver Unit Tests', function ()
{
    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    // MockVersionResolver is a VersionResolver that uses a fake releases.json
    // (prevents us from making web requests in unit tests)
    const resolver: MockVersionResolver = new MockVersionResolver(getMockAcquisitionContext('runtime', ''));

    test('Get Available Versions', async () =>
    {
        const result: IDotnetListVersionsResult = await resolver.GetAvailableDotnetVersions(undefined);

        assert(result);
        assert(result.length > 0);
        assert(result.some(x => x.version === '2.2.207')); // this is one of the versions we'd expect to be available.
    });

    test('Error With Invalid Version', async () =>
    {
        assert.isRejected(resolver.getFullVersion('foo', 'runtime'), Error, 'Invalid version');
    });

    test('Error With Three Part Version', async () =>
    {
        assert.isRejected(resolver.getFullVersion('1.0.16', 'runtime'), Error, 'Invalid version');
    });

    test('Error With Invalid Major.Minor', async () =>
    {
        assert.isRejected(resolver.getFullVersion('0.0', 'runtime'), Error, 'Unable to resolve version');
    });

    test('Resolve Valid Runtime Versions', async () =>
    {
        for (const version of versionPairs)
        {
            assert.equal(await resolver.getFullVersion(version[0], 'runtime'), version[1]);
        }
    });

    test('Resolve Latest SDK Version', async () =>
    {
        assert.equal(await resolver.getFullVersion('2.2', 'sdk'), '2.2.207');
    });
});

