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
    const eventStream = new MockEventStream();
    const context = new MockExtensionContext();
    // MockVersionResolver is a VersionResolver that uses a fake releases.json
    // (prevents us from making web requests in unit tests)
    const resolver: MockVersionResolver = new MockVersionResolver(getMockAcquisitionContext(true, ''));

    test('Get Available Versions', async () => {
        const result : IDotnetListVersionsResult = await resolver.GetAvailableDotnetVersions(undefined);

        assert(result);
        assert(result.length > 0);
        assert(result.some(x => x.version === '2.2.207')); // this is one of the versions we'd expect to be available.
    });

    test('Error With Invalid Version', async () => {
        assert.isRejected(resolver.getFullRuntimeVersion('foo'), Error, 'Invalid version');
    });

    test('Error With Three Part Version', async () => {
        assert.isRejected(resolver.getFullRuntimeVersion('1.0.16'), Error, 'Invalid version');
    });

    test('Error With Invalid Major.Minor', async () => {
        assert.isRejected(resolver.getFullRuntimeVersion('0.0'), Error, 'Unable to resolve version');
    });

    test('Resolve Valid Runtime Versions', async () => {
        for (const version of versionPairs) {
            assert.equal(await resolver.getFullRuntimeVersion(version[0]), version[1]);
        }
    });

    test('Resolve Latest SDK Version', async () => {
        assert.equal(await resolver.getFullSDKVersion('2.2'), '2.2.207');
    });

    test('Get Major from SDK Version', async () => {
        assert.equal(resolver.getMajor(fullySpecifiedVersion), '7');
        assert.equal(resolver.getMajor(featureBandVersion), '7');
        assert.equal(resolver.getMajor(uniqueMajorMinorVersion), '7');
        assert.equal(resolver.getMajor(twoDigitMajorVersion), '10');
    });

    test('Get Major.Minor from SDK Version', async () => {
        assert.equal(resolver.getMajorMinor(fullySpecifiedVersion), '7.0');
        assert.equal(resolver.getMajorMinor(featureBandVersion), '7.0');
        assert.equal(resolver.getMajorMinor(uniqueMajorMinorVersion), '7.1');
        assert.equal(resolver.getMajorMinor(twoDigitMajorVersion), '10.0');
    });

    test('Get Feature Band from SDK Version', async () => {
        assert.equal(resolver.getFeatureBandFromVersion(fullySpecifiedVersion), '2');
        assert.equal(resolver.getFeatureBandFromVersion(featureBandVersion), '2');
        assert.equal(resolver.getFeatureBandFromVersion(uniqueMajorMinorVersion), '3');
        assert.equal(resolver.getFeatureBandFromVersion(twoDigitMajorVersion), '1');
    });

    test('Get Patch from SDK Version', async () => {
        assert.equal(resolver.getFeatureBandPatchVersion(fullySpecifiedVersion), '1');
        assert.equal(resolver.getFeatureBandPatchVersion(uniqueMajorMinorVersion), '0');
        assert.equal(resolver.getFeatureBandPatchVersion(twoDigitMajorVersion), '2');
        assert.equal(resolver.getFeatureBandPatchVersion(twoDigitPatchVersion), '21');
    });

    test('Detects Unspecified Patch Version', async () => {
        assert.equal(resolver.isNonSpecificFeatureBandedVersion(fullySpecifiedVersion), false, 'It detects versions with patches');
        assert.equal(resolver.isNonSpecificFeatureBandedVersion(featureBandVersion), true, 'It detects versions with xx');
        assert.equal(resolver.isNonSpecificFeatureBandedVersion(twoDigitMajorVersion), false, 'It does not error for non xx containing version');
    });

    test('Detects if Fully Specified Version', async () => {
        assert.equal(resolver.isFullySpecifiedVersion(fullySpecifiedVersion), true, 'It passes basic fully specified version');
        assert.equal(resolver.isFullySpecifiedVersion(uniqueMajorMinorVersion), true);
        assert.equal(resolver.isFullySpecifiedVersion(twoDigitMajorVersion), true, 'It works for 2+ digit major versions');
        assert.equal(resolver.isFullySpecifiedVersion(majorOnly), false, 'It detects major only versions are not fully specified');
        assert.equal(resolver.isFullySpecifiedVersion(featureBandVersion), false, 'It counts feature band only with xxx as not fully specified');
        assert.equal(resolver.isFullySpecifiedVersion(majorMinorOnly), false, 'It detects major.minor as not fully specified');
    });

    test('Detects if Only Major or Minor Given', async () => {
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(fullySpecifiedVersion), false, 'It does not think a fully specified version is major.minor only');
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(uniqueMajorMinorVersion), false);
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(twoDigitMajorVersion), false);
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(majorOnly), true, 'It detects major only versions as major only versions');
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(featureBandVersion), false, 'It does not think xx versions are major minor versions');
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(majorMinorOnly), true, 'It can determine if the version is only major.minor');
    });

    test('Detects if Version is Valid', async () => {
        assert.equal(resolver.isValidLongFormVersionFormat(fullySpecifiedVersion), true, 'It detects a full version as valid');
        assert.equal(resolver.isValidLongFormVersionFormat(uniqueMajorMinorVersion), true);
        assert.equal(resolver.isValidLongFormVersionFormat(twoDigitMajorVersion), true);
        assert.equal(resolver.isValidLongFormVersionFormat(featureBandVersion), true);
        assert.equal(resolver.isValidLongFormVersionFormat(majorOnly), false, 'It detects a major only version as not a full version');
        assert.equal(resolver.isValidLongFormVersionFormat(majorMinorOnly), false, 'It detects a major minor as not a full version');
        assert.equal(resolver.isValidLongFormVersionFormat(badSDKVersionLongPatch), false, 'It detects a version with a patch thats too large');
        assert.equal(resolver.isValidLongFormVersionFormat(badSDKVersionPatch), false, 'It detects a version that has a too short patch');
        assert.equal(resolver.isValidLongFormVersionFormat(badSDKVersionPeriods), false, 'It detects a version with a bad number of periods');
    });
});

