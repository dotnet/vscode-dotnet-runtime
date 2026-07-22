/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as os from 'os';
import { looksLikeRuntimeVersion } from '../../Acquisition/DotnetInstall';
import { getAssumedInstallInfo, getInstallIdCustomArchitecture, getVersionFromLegacyInstallId } from '../../Utils/InstallIdUtilities';

const assert = chai.assert;

const stableVersion = '8.0.100';
const previewVersion = '11.0.100-preview.6.26352.110';
const rcVersion = '9.0.100-rc.2.24473.5';

suite('Install Id Utilities Unit Tests', function ()
{
    test('It extracts the full version from a global preview install id', async () =>
    {
        // Regression: the version has dashes, so splitting on the first '-' would truncate it to 11.0.100.
        const previewId = getInstallIdCustomArchitecture(previewVersion, os.arch(), 'sdk', 'global');
        assert.equal(getVersionFromLegacyInstallId(previewId), previewVersion, 'The full preview version is recovered from the global install id');

        const rcId = getInstallIdCustomArchitecture(rcVersion, os.arch(), 'sdk', 'global');
        assert.equal(getVersionFromLegacyInstallId(rcId), rcVersion, 'The full rc version is recovered from the global install id');

        const mixedCaseMarkerId = previewId.replace('-global', '-GLOBAL');
        assert.equal(getVersionFromLegacyInstallId(mixedCaseMarkerId), previewVersion, 'The full preview version is recovered from a mixed-case global marker');
    });

    test('It extracts the version from a stable global install id', async () =>
    {
        const stableId = getInstallIdCustomArchitecture(stableVersion, os.arch(), 'sdk', 'global');
        assert.equal(getVersionFromLegacyInstallId(stableId), stableVersion);
    });

    test('It extracts the version from a global install id without an architecture', async () =>
    {
        const previewId = getInstallIdCustomArchitecture(previewVersion, null, 'sdk', 'global');
        assert.equal(getVersionFromLegacyInstallId(previewId), previewVersion, 'The full preview version is recovered when no architecture is encoded');
    });

    test('It extracts the version from a local install id', async () =>
    {
        const localId = getInstallIdCustomArchitecture(stableVersion, os.arch(), 'sdk', 'local');
        assert.equal(getVersionFromLegacyInstallId(localId), stableVersion);
    });

    test('It classifies SDK and runtime versions including previews', async () =>
    {
        assert.equal(looksLikeRuntimeVersion(previewVersion), false, 'A preview SDK feature-band version is not a runtime version');
        assert.equal(looksLikeRuntimeVersion(stableVersion), false, 'A stable SDK feature-band version is not a runtime version');
        assert.equal(looksLikeRuntimeVersion('8.0.19'), true, 'A stable runtime patch version is a runtime version');
        assert.equal(looksLikeRuntimeVersion('9.0.0-rc.2.24473.5'), true, 'A preview runtime patch version is a runtime version');
    });

    test('It preserves an explicit install mode when assuming legacy install info', async () =>
    {
        assert.equal(getAssumedInstallInfo('8.0.19', 'sdk').installMode, 'sdk');
    });
});
