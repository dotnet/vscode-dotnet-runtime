/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import { DotnetInstallMode } from '../../Acquisition/DotnetInstallMode';
import { DistroVersionPair, DotnetDistroSupportStatus, LinuxVersionResolver } from '../../Acquisition/LinuxVersionResolver';
import { RockyLinuxDistroSDKProvider } from '../../Acquisition/RockyLinuxDistroSDKProvider';
import { ROCKY_LINUX_DISTRO_INFO_KEY } from '../../Acquisition/StringConstants';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor } from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
const assert = chai.assert;
const standardTimeoutTime = 100000;

const mockVersion = '8.0.100';
const acquisitionContext = getMockAcquisitionContext('sdk', mockVersion);
const mockExecutor = new MockCommandExecutor(acquisitionContext, getMockUtilityContext());
const pair: DistroVersionPair = { distro: ROCKY_LINUX_DISTRO_INFO_KEY, version: '8.10' };
const provider: RockyLinuxDistroSDKProvider = new RockyLinuxDistroSDKProvider(pair, acquisitionContext, getMockUtilityContext(), mockExecutor);
const versionResolver = new LinuxVersionResolver(acquisitionContext, getMockUtilityContext(), mockExecutor);
let shouldRun = os.platform() === 'linux';
const installType: DotnetInstallMode = 'sdk';
const noDotnetString = `

Command 'dotnet' not found, but can be installed with:

            dnf install dotnet-sdk-8.0
`

suite('Rocky Linux Distro Logic Unit Tests', function ()
{
    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('Package Check Succeeds', async () =>
    {
        shouldRun = os.platform() === 'linux' && (await versionResolver.getRunningDistro()).distro === ROCKY_LINUX_DISTRO_INFO_KEY;

        if (shouldRun)
        {
            await provider.dotnetPackageExistsOnSystem(mockVersion, installType);
            assert.equal(mockExecutor.attemptedCommand, 'dnf list install dotnet-sdk-8.0 -q');
        }
    }).timeout(standardTimeoutTime);

    test('Support Status Check', async () =>
    {
        if (shouldRun)
        {
            const status = await provider.getDotnetVersionSupportStatus(mockVersion, installType);
            assert.equal(status, DotnetDistroSupportStatus.Distro);
        }
    }).timeout(standardTimeoutTime);

    test('Gets Distro Feed Install Dir', async () =>
    {
        if (shouldRun)
        {
            const distroFeedDir = await provider.getExpectedDotnetDistroFeedInstallationDirectory();
            assert.equal(distroFeedDir, '/usr/lib64/dotnet');
        }
    }).timeout(standardTimeoutTime);

    test('Gets Microsoft Feed Install Dir', async () =>
    {
        if (shouldRun)
        {
            const microsoftFeedDir = await provider.getExpectedDotnetMicrosoftFeedInstallationDirectory();
            assert.equal(microsoftFeedDir, '');
        }
    }).timeout(standardTimeoutTime);

    test('Gets Installed SDKs', async () =>
    {
        if (shouldRun)
        {
            mockExecutor.fakeReturnValue = {
                stdout: `
8.0.100 [/usr/lib/dotnet/sdk]
8.0.200 [/usr/lib64/dotnet/sdk]`, stderr: '', status: '0'
            };
            let versions = await provider.getInstalledDotnetSDKVersions();
            mockExecutor.resetReturnValues();
            assert.deepStrictEqual(versions, ['8.0.100', '8.0.200']);

            mockExecutor.fakeReturnValue = { stdout: noDotnetString, stderr: noDotnetString, status: '0' };
            versions = await provider.getInstalledDotnetSDKVersions();
            mockExecutor.resetReturnValues();
            assert.deepStrictEqual(versions, []);
        }
    }).timeout(standardTimeoutTime);

    test('Gets Installed Runtimes', async () =>
    {
        if (shouldRun)
        {
            mockExecutor.fakeReturnValue = {
                stdout: `
Microsoft.NETCore.App 8.0.0 [/usr/lib64/dotnet/shared/Microsoft.NETCore.App]
Microsoft.NETCore.App 8.0.6 [/usr/lib64/dotnet/shared/Microsoft.NETCore.App]`, stderr: '', status: '0'
            };
            let versions = await provider.getInstalledDotnetRuntimeVersions();
            mockExecutor.resetReturnValues();
            assert.deepStrictEqual(versions, ['8.0.0', '8.0.6']);

            mockExecutor.fakeReturnValue = { stdout: noDotnetString, stderr: noDotnetString, status: '0' };
            versions = await provider.getInstalledDotnetRuntimeVersions();
            mockExecutor.resetReturnValues();
            assert.deepStrictEqual(versions, []);
        }
    }).timeout(standardTimeoutTime);

    test('Version Lookup Resolves Correctly For Rocky 8.x', async () =>
    {
        // Rocky Linux 8.10 -> version key "8.0" in distro-support.json
        if (shouldRun)
        {
            const packageName = await provider.getExpectedDotnetPackageNameForVersion(mockVersion, installType);
            assert.equal(packageName, 'dotnet-sdk-8.0');
        }
    }).timeout(standardTimeoutTime);
});
