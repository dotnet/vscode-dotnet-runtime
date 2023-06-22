/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import { MockEventStream, MockExtensionContext, MockVersionResolver, versionPairs } from '../mocks/MockObjects';
import { IDotnetListVersionsResult } from '../../IDotnetListVersionsContext';
import { VersionResolver } from '../../Acquisition/VersionResolver';
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

    test('Get Major from SDK Version', async () => {
        assert.equal(VersionResolver.getMajor(fullySpecifiedVersion), '7');
        assert.equal(VersionResolver.getMajor(featureBandVersion), '7');
        assert.equal(VersionResolver.getMajor(uniqueMajorMinorVersion), '7');
        assert.equal(VersionResolver.getMajor(twoDigitMajorVersion), '10');
    });

    test('Get Major.Minor from SDK Version', async () => {
        assert.equal(VersionResolver.getMajorMinor(fullySpecifiedVersion), '7.0');
        assert.equal(VersionResolver.getMajorMinor(featureBandVersion), '7.0');
        assert.equal(VersionResolver.getMajorMinor(uniqueMajorMinorVersion), '7.1');
        assert.equal(VersionResolver.getMajorMinor(twoDigitMajorVersion), '10.0');
    });

    test('Get Feature Band from SDK Version', async () => {
        assert.equal(VersionResolver.getFeatureBandFromVersion(fullySpecifiedVersion), '2');
        assert.equal(VersionResolver.getFeatureBandFromVersion(featureBandVersion), '2');
        assert.equal(VersionResolver.getFeatureBandFromVersion(uniqueMajorMinorVersion), '3');
        assert.equal(VersionResolver.getFeatureBandFromVersion(twoDigitMajorVersion), '1');
    });

    test('Get Patch from SDK Version', async () => {
        assert.equal(VersionResolver.getFeatureBandPatchVersion(fullySpecifiedVersion), '1');
        assert.equal(VersionResolver.getFeatureBandPatchVersion(uniqueMajorMinorVersion), '0');
        assert.equal(VersionResolver.getFeatureBandPatchVersion(twoDigitMajorVersion), '2');
        assert.equal(VersionResolver.getFeatureBandPatchVersion(twoDigitPatchVersion), '21');
    });

    test('Detects Unspecified Patch Version', async () => {
        assert.equal(VersionResolver.isNonSpecificFeatureBandedVersion(fullySpecifiedVersion), false, 'It detects versions with patches');
        assert.equal(VersionResolver.isNonSpecificFeatureBandedVersion(featureBandVersion), true, 'It detects versions with xx');
        assert.equal(VersionResolver.isNonSpecificFeatureBandedVersion(twoDigitMajorVersion), false, 'It doesnt error for non xx containing version');
    });

    test('Detects if Fully Specified Version', async () => {
        assert.equal(VersionResolver.isFullySpecifiedVersion(fullySpecifiedVersion), true, 'It passes basic fully specified version');
        assert.equal(VersionResolver.isFullySpecifiedVersion(uniqueMajorMinorVersion), true);
        assert.equal(VersionResolver.isFullySpecifiedVersion(twoDigitMajorVersion), true, 'It works for 2+ digit major versions');
        assert.equal(VersionResolver.isFullySpecifiedVersion(majorOnly), false, 'It detects major only versions arent fully specified');
        assert.equal(VersionResolver.isFullySpecifiedVersion(featureBandVersion), false, 'It counts feature band only with xxx as not fully specified');
        assert.equal(VersionResolver.isFullySpecifiedVersion(majorMinorOnly), false, 'It detects major.minor as not fully specified');
    });

    test('Detects if Only Major or Minor Given', async () => {
        assert.equal(VersionResolver.isNonSpecificMajorOrMajorMinorVersion(fullySpecifiedVersion), false, 'It doesnt think a fully specified version is major.minor only');
        assert.equal(VersionResolver.isNonSpecificMajorOrMajorMinorVersion(uniqueMajorMinorVersion), false);
        assert.equal(VersionResolver.isNonSpecificMajorOrMajorMinorVersion(twoDigitMajorVersion), false);
        assert.equal(VersionResolver.isNonSpecificMajorOrMajorMinorVersion(majorOnly), true, 'It detects major only versions as major only versions');
        assert.equal(VersionResolver.isNonSpecificMajorOrMajorMinorVersion(featureBandVersion), false, 'It doesnt think xx versions are major minor versions');
        assert.equal(VersionResolver.isNonSpecificMajorOrMajorMinorVersion(majorMinorOnly), true), 'It can determine if the version is only major.minor';
    });

    test('Detects if Version is Valid', async () => {
        assert.equal(VersionResolver.isValidLongFormVersionFormat(fullySpecifiedVersion), true, 'It detects a full version as valid');
        assert.equal(VersionResolver.isValidLongFormVersionFormat(uniqueMajorMinorVersion), true);
        assert.equal(VersionResolver.isValidLongFormVersionFormat(twoDigitMajorVersion), true);
        assert.equal(VersionResolver.isValidLongFormVersionFormat(featureBandVersion), true);
        assert.equal(VersionResolver.isValidLongFormVersionFormat(majorOnly), false, 'It detects a major only version as not a full version');
        assert.equal(VersionResolver.isValidLongFormVersionFormat(majorMinorOnly), false, 'It detects a major minor as not a full version');
        assert.equal(VersionResolver.isValidLongFormVersionFormat(badSDKVersionLongPatch), false, 'It detects a version with a patch thats too large');
        assert.equal(VersionResolver.isValidLongFormVersionFormat(badSDKVersionPatch), false, 'It detects a version that has a too short patch');
        assert.equal(VersionResolver.isValidLongFormVersionFormat(badSDKVersionPeriods), false, 'It detects a version with a bad number of periods');
    });
});

