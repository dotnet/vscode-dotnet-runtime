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
const previewVersion = '11.0.100-preview.6.26352.110';
const rcVersion = '9.0.100-rc.2.24473.5';

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

    test('Detects Pre-Release Suffix', async () =>
    {
        assert.equal(resolver.hasPreReleaseSuffix('8.0.400-preview.0.24324.5'), true);
        assert.equal(resolver.hasPreReleaseSuffix('9.0.0-rc.2'), true);
        assert.equal(resolver.hasPreReleaseSuffix('9.0.0-rc.2.24473.5'), true);
        assert.equal(resolver.hasPreReleaseSuffix('8.0.0-preview.7'), true);
        assert.equal(resolver.hasPreReleaseSuffix('10.0.0-alpha.2.24522.8'), true);
        assert.equal(resolver.hasPreReleaseSuffix(featureBandVersion), false);
        assert.equal(resolver.hasPreReleaseSuffix(majorMinorOnly), false);
        assert.equal(resolver.hasPreReleaseSuffix(badSDKVersionPatch), false);
        assert.equal(resolver.hasPreReleaseSuffix('8.0.100-'), false, 'A delimiter without content is not a suffix');
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
        assert.equal(resolver.isFullySpecifiedVersion(previewVersion, mockEventStream, mockCtx), true, 'It counts a fully specified preview build as fully specified');
        assert.equal(resolver.isFullySpecifiedVersion(rcVersion, mockEventStream, mockCtx), true, 'It counts a fully specified rc build as fully specified');
        assert.equal(resolver.isFullySpecifiedVersion('-foo', mockEventStream, mockCtx), false, 'A suffix without a numeric version is not fully specified');
        assert.equal(resolver.isFullySpecifiedVersion('10.0.100-foo', mockEventStream, mockCtx), false, 'An unknown pre-release suffix is not fully specified');
        assert.equal(resolver.isFullySpecifiedVersion('10.0.100-bar-1.3', mockEventStream, mockCtx), false, 'An unknown compound pre-release suffix is not fully specified');
    });

    test('Detects if Fully Specified Preview Version', async () =>
    {
        assert.equal(resolver.isFullySpecifiedPreviewVersion(previewVersion, mockEventStream, mockCtx), true, 'It detects a fully specified preview build');
        assert.equal(resolver.isFullySpecifiedPreviewVersion(rcVersion, mockEventStream, mockCtx), true, 'It detects a fully specified rc build');
        assert.equal(resolver.isFullySpecifiedPreviewVersion('8.0.400-preview.0.24324.5', mockEventStream, mockCtx), true);
        assert.equal(resolver.isFullySpecifiedPreviewVersion('1.0.100-preview2.1-003177', mockEventStream, mockCtx), true, 'It supports the historical .NET Core preview format');
        assert.equal(resolver.isFullySpecifiedPreviewVersion(fullySpecifiedVersion, mockEventStream, mockCtx), false, 'A stable fully specified version is not a preview');
        assert.equal(resolver.isFullySpecifiedPreviewVersion(featureBandVersion, mockEventStream, mockCtx), false, 'A feature band is not a fully specified preview');
        assert.equal(resolver.isFullySpecifiedPreviewVersion(majorMinorOnly, mockEventStream, mockCtx), false, 'A major.minor is not a fully specified preview');
        assert.equal(resolver.isFullySpecifiedPreviewVersion('11.0-preview.6', mockEventStream, mockCtx), false, 'A partial version with a suffix is not fully specified');
        assert.equal(resolver.isFullySpecifiedPreviewVersion('-foo', mockEventStream, mockCtx), false, 'A suffix without a numeric version is not fully specified');
        assert.equal(resolver.isFullySpecifiedPreviewVersion('10.0.100-foo', mockEventStream, mockCtx), false, 'An unknown pre-release suffix is not fully specified');
        assert.equal(resolver.isFullySpecifiedPreviewVersion('10.0.100-bar-1.3', mockEventStream, mockCtx), false, 'An unknown compound pre-release suffix is not fully specified');
        assert.equal(resolver.isFullySpecifiedPreviewVersion('2.2.100-rel-33220-00', mockEventStream, mockCtx), false, 'A package-only Native suffix is not supported without release metadata');
        assert.equal(resolver.isFullySpecifiedPreviewVersion('4.8.100-arm64rel-26502-00', mockEventStream, mockCtx), false, 'A package-only Native ARM64 suffix is not supported without release metadata');
    });

    test('Strips Pre-Release Suffix From Version', async () =>
    {
        assert.equal(resolver.getVersionWithoutPreReleaseSuffix(previewVersion), '11.0.100');
        assert.equal(resolver.getVersionWithoutPreReleaseSuffix(rcVersion), '9.0.100');
        assert.equal(resolver.getVersionWithoutPreReleaseSuffix(fullySpecifiedVersion), fullySpecifiedVersion, 'It leaves a stable version unchanged');
    });

    test('Extracts Pre-Release Suffix From Version', async () =>
    {
        assert.equal(resolver.getPreReleaseSuffix(previewVersion), 'preview.6.26352.110');
        assert.equal(resolver.getPreReleaseSuffix(rcVersion), 'rc.2.24473.5');
        assert.equal(resolver.getPreReleaseSuffix(fullySpecifiedVersion), '', 'A stable version has no pre-release suffix');
    });

    test('Compares SDK Patch Or Pre-Release', async () =>
    {
        // Different feature-band patch numbers compare numerically.
        assert.isBelow(resolver.compareSDKPatchOrPreRelease('7.0.301', '7.0.311', mockEventStream, mockCtx), 0, '301 is older than 311');
        assert.isAbove(resolver.compareSDKPatchOrPreRelease('7.0.311', '7.0.301', mockEventStream, mockCtx), 0, '311 is newer than 301');
        assert.equal(resolver.compareSDKPatchOrPreRelease('7.0.301', '7.0.301', mockEventStream, mockCtx), 0, 'Identical stable versions are equal');

        // Same feature-band patch, differing pre-release identity.
        assert.isBelow(resolver.compareSDKPatchOrPreRelease('11.0.100-preview.5.26352.110', '11.0.100-preview.6.26352.110', mockEventStream, mockCtx), 0, 'preview.5 is older than preview.6');
        assert.isAbove(resolver.compareSDKPatchOrPreRelease('11.0.100-preview.6.26352.110', '11.0.100-preview.5.26352.110', mockEventStream, mockCtx), 0, 'preview.6 is newer than preview.5');
        assert.equal(resolver.compareSDKPatchOrPreRelease('11.0.100-preview.6.26352.110', '11.0.100-preview.6.26352.110', mockEventStream, mockCtx), 0, 'Identical preview builds are equal');

        // A stable release outranks a pre-release with the same numeric patch.
        assert.isAbove(resolver.compareSDKPatchOrPreRelease('11.0.100', '11.0.100-preview.6.26352.110', mockEventStream, mockCtx), 0, 'A stable release is newer than its preview');
        assert.isBelow(resolver.compareSDKPatchOrPreRelease('11.0.100-preview.6.26352.110', '11.0.100', mockEventStream, mockCtx), 0, 'A preview is older than its stable release');
    });

    test('Compares Versions Including Pre-Release (runtime + sdk)', async () =>
    {
        // Runtime patch ordering.
        assert.isBelow(resolver.compareVersionsIncludingPreRelease('8.0.5', '8.0.19'), 0, '8.0.5 is older than 8.0.19');
        assert.isAbove(resolver.compareVersionsIncludingPreRelease('8.0.19', '8.0.5'), 0, '8.0.19 is newer than 8.0.5');

        // SDK feature-band patch ordering.
        assert.isBelow(resolver.compareVersionsIncludingPreRelease('8.0.301', '8.0.311'), 0, '8.0.301 is older than 8.0.311');

        // Pre-release ordering for both runtime and SDK.
        assert.isBelow(resolver.compareVersionsIncludingPreRelease('9.0.0-rc.1.24431.7', '9.0.0-rc.2.24473.5'), 0, 'rc.1 is older than rc.2');
        assert.isAbove(resolver.compareVersionsIncludingPreRelease('9.0.0', '9.0.0-rc.2.24473.5'), 0, 'A stable runtime release is newer than its rc');
        assert.isBelow(resolver.compareVersionsIncludingPreRelease('11.0.100-preview.5.26352.110', '11.0.100-preview.6.26352.110'), 0, 'sdk preview.5 is older than preview.6');
        assert.equal(resolver.compareVersionsIncludingPreRelease('8.0.19', '8.0.19'), 0, 'Identical versions are equivalent');

        // .NET releases order preview < rc < GA within a base version; semver identifier ordering matches this.
        assert.isBelow(resolver.compareVersionsIncludingPreRelease('9.0.0-preview.7.24405.7', '9.0.0-rc.1.24431.7'), 0, 'preview is older than rc');
        assert.isBelow(resolver.compareVersionsIncludingPreRelease('9.0.0-rc.2.24473.5', '9.0.0'), 0, 'rc is older than GA');
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

});