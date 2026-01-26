/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as resolver from '../../Acquisition/VersionUtilities';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockEventStream } from '../mocks/MockObjects';
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

suite('Version Utilities Unit Tests', function ()
{
    this.afterEach(async () =>
    {
        LocalMemoryCacheSingleton.getInstance().invalidate();
        WebRequestWorkerSingleton.getInstance().destroy();
    });

    const mockEventStream = new MockEventStream();
    const mockCtx = getMockAcquisitionContext('runtime', '7.0');

    test('Get Major from SDK Version', async () =>
    {
        assert.equal(resolver.getMajor(fullySpecifiedVersion, mockEventStream, mockCtx), '7');
        assert.equal(resolver.getMajor(featureBandVersion, mockEventStream, mockCtx), '7');
        assert.equal(resolver.getMajor(uniqueMajorMinorVersion, mockEventStream, mockCtx), '7');
        assert.equal(resolver.getMajor(twoDigitMajorVersion, mockEventStream, mockCtx), '10');
    });

    test('Get Minor from SDK Version', async () =>
    {
        assert.equal(resolver.getMinor(fullySpecifiedVersion, mockEventStream, mockCtx), '0');
        assert.equal(resolver.getMinor(uniqueMajorMinorVersion, mockEventStream, mockCtx), '1');
        assert.equal(resolver.getMinor(twoDigitMajorVersion, mockEventStream, mockCtx), '0');
    });

    test('Get Major.Minor from SDK Version', async () =>
    {
        assert.equal(resolver.getMajorMinor(fullySpecifiedVersion, mockEventStream, mockCtx), '7.0');
        assert.equal(resolver.getMajorMinor(featureBandVersion, mockEventStream, mockCtx), '7.0');
        assert.equal(resolver.getMajorMinor(uniqueMajorMinorVersion, mockEventStream, mockCtx), '7.1');
        assert.equal(resolver.getMajorMinor(twoDigitMajorVersion, mockEventStream, mockCtx), '10.0');
    });

    test('Get Feature Band from SDK Version', async () =>
    {
        assert.equal(resolver.getFeatureBandFromVersion(fullySpecifiedVersion, mockEventStream, mockCtx), '2');
        assert.equal(resolver.getFeatureBandFromVersion(featureBandVersion, mockEventStream, mockCtx), '2');
        assert.equal(resolver.getFeatureBandFromVersion(uniqueMajorMinorVersion, mockEventStream, mockCtx), '3');
        assert.equal(resolver.getFeatureBandFromVersion(twoDigitMajorVersion, mockEventStream, mockCtx), '1');
    });

    test('Get Patch from SDK Version', async () =>
    {
        assert.equal(resolver.getFeatureBandPatchVersion(fullySpecifiedVersion, mockEventStream, mockCtx), '1');
        assert.equal(resolver.getFeatureBandPatchVersion(uniqueMajorMinorVersion, mockEventStream, mockCtx), '0');
        assert.equal(resolver.getFeatureBandPatchVersion(twoDigitMajorVersion, mockEventStream, mockCtx), '2');
        assert.equal(resolver.getFeatureBandPatchVersion(twoDigitPatchVersion, mockEventStream, mockCtx), '21');
    });

    test('Get Band+Patch from SDK Version', async () =>
    {
        assert.equal(resolver.getSDKCompleteBandAndPatchVersionString(fullySpecifiedVersion, mockEventStream, mockCtx), '201');
        assert.equal(resolver.getSDKCompleteBandAndPatchVersionString(uniqueMajorMinorVersion, mockEventStream, mockCtx), '300');
        assert.equal(resolver.getSDKCompleteBandAndPatchVersionString(twoDigitMajorVersion, mockEventStream, mockCtx), '102');
        assert.equal(resolver.getSDKCompleteBandAndPatchVersionString(twoDigitPatchVersion, mockEventStream, mockCtx), '221');
        assert.equal(resolver.getSDKPatchVersionString('8.0', mockEventStream, mockCtx, false), '', 'It does not error if no feature band in version if no error bool set');
    });

    test('Get Patch from Runtime Version', async () =>
    {
        assert.equal(resolver.getRuntimePatchVersionString(majorMinorOnly, mockEventStream, mockCtx), null);
        assert.equal(resolver.getRuntimePatchVersionString('8.0.10', mockEventStream, mockCtx), '10');
        assert.equal(resolver.getRuntimePatchVersionString('8.0.9-rc.2.24502.A', mockEventStream, mockCtx), '9');
    });

    test('Get Patch from SDK Preview Version', async () =>
    {
        assert.equal(resolver.getFeatureBandPatchVersion('8.0.400-preview.0.24324.5', mockEventStream, mockCtx), '0');
    });

    test('Detects IsPreview Version', async () =>
    {
        assert.equal(resolver.isPreviewVersion('8.0.400-preview.0.24324.5', mockEventStream, mockCtx), true);
        assert.equal(resolver.isPreviewVersion('9.0.0-rc.2', mockEventStream, mockCtx), true);
        assert.equal(resolver.isPreviewVersion('9.0.0-rc.2.24473.5', mockEventStream, mockCtx), true);
        assert.equal(resolver.isPreviewVersion('9.0.0-rc.2.24473.5', mockEventStream, mockCtx), true);
        assert.equal(resolver.isPreviewVersion('8.0.0-preview.7', mockEventStream, mockCtx), true);
        assert.equal(resolver.isPreviewVersion('10.0.0-alpha.2.24522.8', mockEventStream, mockCtx), true);
        assert.equal(resolver.isPreviewVersion(featureBandVersion, mockEventStream, mockCtx), false);
        assert.equal(resolver.isPreviewVersion(majorMinorOnly, mockEventStream, mockCtx), false);
        assert.equal(resolver.isPreviewVersion(badSDKVersionPatch, mockEventStream, mockCtx), false);
    });

    test('Detects Unspecified Patch Version', async () =>
    {
        assert.equal(resolver.isNonSpecificFeatureBandedVersion(fullySpecifiedVersion), false, 'It detects versions with patches');
        assert.equal(resolver.isNonSpecificFeatureBandedVersion(featureBandVersion), true, 'It detects versions with xx');
        assert.equal(resolver.isNonSpecificFeatureBandedVersion(twoDigitMajorVersion), false, 'It does not error for non xx containing version');
    });

    test('Detects if Fully Specified Version', async () =>
    {
        assert.equal(resolver.isFullySpecifiedVersion(fullySpecifiedVersion, mockEventStream, mockCtx), true, 'It passes basic fully specified version');
        assert.equal(resolver.isFullySpecifiedVersion(uniqueMajorMinorVersion, mockEventStream, mockCtx), true);
        assert.equal(resolver.isFullySpecifiedVersion(twoDigitMajorVersion, mockEventStream, mockCtx), true, 'It works for 2+ digit major versions');
        assert.equal(resolver.isFullySpecifiedVersion(majorOnly, mockEventStream, mockCtx), false, 'It detects major only versions are not fully specified');
        assert.equal(resolver.isFullySpecifiedVersion(featureBandVersion, mockEventStream, mockCtx), false, 'It counts feature band only with xxx as not fully specified');
        assert.equal(resolver.isFullySpecifiedVersion(majorMinorOnly, mockEventStream, mockCtx), false, 'It detects major.minor as not fully specified');
    });

    test('Detects if Only Major or Minor Given', async () =>
    {
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(fullySpecifiedVersion), false, 'It does not think a fully specified version is major.minor only');
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(uniqueMajorMinorVersion), false);
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(twoDigitMajorVersion), false);
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(majorOnly), true, 'It detects major only versions as major only versions');
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(featureBandVersion), false, 'It does not think xx versions are major minor versions');
        assert.equal(resolver.isNonSpecificMajorOrMajorMinorVersion(majorMinorOnly), true, 'It can determine if the version is only major.minor');
    });

    test('Detects if Version is Valid', async () =>
    {
        assert.equal(resolver.isValidLongFormVersionFormat(fullySpecifiedVersion, mockEventStream, mockCtx), true, 'It detects a full version as valid');
        assert.equal(resolver.isValidLongFormVersionFormat(uniqueMajorMinorVersion, mockEventStream, mockCtx), true);
        assert.equal(resolver.isValidLongFormVersionFormat(twoDigitMajorVersion, mockEventStream, mockCtx), true);
        assert.equal(resolver.isValidLongFormVersionFormat(featureBandVersion, mockEventStream, mockCtx), true);
        assert.equal(resolver.isValidLongFormVersionFormat(majorOnly, mockEventStream, mockCtx), false, 'It detects a major only version as not a full version');
        assert.equal(resolver.isValidLongFormVersionFormat(majorMinorOnly, mockEventStream, mockCtx), false, 'It detects a major minor as not a full version');
        assert.equal(resolver.isValidLongFormVersionFormat(badSDKVersionLongPatch, mockEventStream, mockCtx), false, 'It detects a version with a patch thats too large');
        assert.equal(resolver.isValidLongFormVersionFormat(badSDKVersionPatch, mockEventStream, mockCtx), false, 'It detects a version that has a too short patch');
        assert.equal(resolver.isValidLongFormVersionFormat(badSDKVersionPeriods, mockEventStream, mockCtx), false, 'It detects a version with a bad number of periods');
    });

    test('parseSdkVersion parses SDK versions correctly', async () =>
    {
        const v1 = resolver.parseSdkVersion('8.0.308');
        assert.equal(v1.major, 8);
        assert.equal(v1.minor, 0);
        assert.equal(v1.featureBand, 3);
        assert.equal(v1.patch, 8);
        assert.equal(v1.patchFull, 308);
        assert.equal(v1.isPrerelease, false);

        const v2 = resolver.parseSdkVersion('9.0.100-preview.1');
        assert.equal(v2.major, 9);
        assert.equal(v2.minor, 0);
        assert.equal(v2.featureBand, 1);
        assert.equal(v2.patch, 0);
        assert.equal(v2.isPrerelease, true);

        const v3 = resolver.parseSdkVersion('10.0.200');
        assert.equal(v3.major, 10);
        assert.equal(v3.minor, 0);
        assert.equal(v3.featureBand, 2);
        assert.equal(v3.patch, 0);
    });

    test('isCompatibleSdkVersion with disable policy requires exact match', async () =>
    {
        assert.equal(resolver.isCompatibleSdkVersion('8.0.308', '8.0.308', 'disable'), true);
        assert.equal(resolver.isCompatibleSdkVersion('8.0.309', '8.0.308', 'disable'), false);
        assert.equal(resolver.isCompatibleSdkVersion('8.0.307', '8.0.308', 'disable'), false);
    });

    test('isCompatibleSdkVersion with patch/latestPatch policy', async () =>
    {
        // Same feature band, higher patch is OK
        assert.equal(resolver.isCompatibleSdkVersion('8.0.308', '8.0.305', 'patch'), true);
        assert.equal(resolver.isCompatibleSdkVersion('8.0.308', '8.0.305', 'latestPatch'), true);

        // Same feature band, lower patch is NOT OK
        assert.equal(resolver.isCompatibleSdkVersion('8.0.304', '8.0.305', 'patch'), false);

        // Different feature band is NOT OK
        assert.equal(resolver.isCompatibleSdkVersion('8.0.400', '8.0.305', 'patch'), false);

        // Different minor is NOT OK
        assert.equal(resolver.isCompatibleSdkVersion('8.1.305', '8.0.305', 'patch'), false);
    });

    test('isCompatibleSdkVersion with feature/latestFeature policy', async () =>
    {
        // Higher feature band is OK
        assert.equal(resolver.isCompatibleSdkVersion('8.0.400', '8.0.305', 'feature'), true);
        assert.equal(resolver.isCompatibleSdkVersion('8.0.400', '8.0.305', 'latestFeature'), true);

        // Same feature band with higher patch is OK
        assert.equal(resolver.isCompatibleSdkVersion('8.0.308', '8.0.305', 'feature'), true);

        // Lower feature band is NOT OK
        assert.equal(resolver.isCompatibleSdkVersion('8.0.200', '8.0.305', 'feature'), false);

        // Different minor is NOT OK
        assert.equal(resolver.isCompatibleSdkVersion('8.1.400', '8.0.305', 'feature'), false);
    });

    test('isCompatibleSdkVersion with minor/latestMinor policy', async () =>
    {
        // Higher minor is OK
        assert.equal(resolver.isCompatibleSdkVersion('8.1.100', '8.0.305', 'minor'), true);
        assert.equal(resolver.isCompatibleSdkVersion('8.1.100', '8.0.305', 'latestMinor'), true);

        // Same minor with higher feature band is OK
        assert.equal(resolver.isCompatibleSdkVersion('8.0.400', '8.0.305', 'minor'), true);

        // Different major is NOT OK
        assert.equal(resolver.isCompatibleSdkVersion('9.0.100', '8.0.305', 'minor'), false);
    });

    test('isCompatibleSdkVersion with major/latestMajor policy', async () =>
    {
        // Higher major is OK
        assert.equal(resolver.isCompatibleSdkVersion('9.0.100', '8.0.305', 'major'), true);
        assert.equal(resolver.isCompatibleSdkVersion('9.0.100', '8.0.305', 'latestMajor'), true);

        // Same major with higher minor is OK
        assert.equal(resolver.isCompatibleSdkVersion('8.1.100', '8.0.305', 'major'), true);

        // Lower major is NOT OK
        assert.equal(resolver.isCompatibleSdkVersion('7.0.400', '8.0.305', 'major'), false);
    });

    test('isCompatibleSdkVersion handles prerelease versions', async () =>
    {
        // Prerelease of same base version is less than release
        assert.equal(resolver.isCompatibleSdkVersion('8.0.308-preview.1', '8.0.308', 'disable'), false);

        // Release is compatible with prerelease requirement
        assert.equal(resolver.isCompatibleSdkVersion('8.0.308', '8.0.308-preview.1', 'patch'), true);
    });

    test('getCompatibleSdkVersions filters versions correctly', async () =>
    {
        const installed = ['7.0.400', '8.0.304', '8.0.308', '8.0.400', '9.0.100'];

        const patchCompatible = resolver.getCompatibleSdkVersions(installed, '8.0.305', 'patch');
        assert.deepEqual(patchCompatible, ['8.0.308']);

        const featureCompatible = resolver.getCompatibleSdkVersions(installed, '8.0.305', 'feature');
        assert.deepEqual(featureCompatible, ['8.0.308', '8.0.400']);

        const majorCompatible = resolver.getCompatibleSdkVersions(installed, '8.0.305', 'major');
        assert.deepEqual(majorCompatible, ['8.0.308', '8.0.400', '9.0.100']);
    });

    test('compareSdkVersions compares versions correctly', async () =>
    {
        assert.isAbove(resolver.compareSdkVersions('8.0.400', '8.0.308'), 0);
        assert.isBelow(resolver.compareSdkVersions('8.0.308', '8.0.400'), 0);
        assert.equal(resolver.compareSdkVersions('8.0.308', '8.0.308'), 0);

        // Different major
        assert.isAbove(resolver.compareSdkVersions('9.0.100', '8.0.400'), 0);

        // Prerelease is less than release
        assert.isBelow(resolver.compareSdkVersions('8.0.308-preview.1', '8.0.308'), 0);
    });

    test('isNewerSdkVersion checks if version is newer', async () =>
    {
        assert.equal(resolver.isNewerSdkVersion('8.0.400', '8.0.308'), true);
        assert.equal(resolver.isNewerSdkVersion('8.0.308', '8.0.400'), false);
        assert.equal(resolver.isNewerSdkVersion('8.0.308', '8.0.308'), false);
        assert.equal(resolver.isNewerSdkVersion('9.0.100', '8.0.400'), true);
    });

});