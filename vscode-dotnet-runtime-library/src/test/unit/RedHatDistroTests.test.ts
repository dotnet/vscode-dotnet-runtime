/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import { DotnetInstallMode } from '../../Acquisition/DotnetInstallMode';
import { DistroVersionPair, DotnetDistroSupportStatus, LinuxVersionResolver } from '../../Acquisition/LinuxVersionResolver';
import { RedHatDistroSDKProvider } from '../../Acquisition/RedHatDistroSDKProvider';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor } from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
import { RED_HAT_DISTRO_INFO_KEY } from '../../Acquisition/StringConstants';
const assert = chai.assert;
const standardTimeoutTime = 100000;

const mockVersion = '7.0.103';
const acquisitionContext = getMockAcquisitionContext('sdk', mockVersion);
const mockExecutor = new MockCommandExecutor(acquisitionContext, getMockUtilityContext());
const pair: DistroVersionPair = { distro: RED_HAT_DISTRO_INFO_KEY, version: '9.0' };
const provider: RedHatDistroSDKProvider = new RedHatDistroSDKProvider(pair, acquisitionContext, getMockUtilityContext(), mockExecutor);
const versionResolver = new LinuxVersionResolver(acquisitionContext, getMockUtilityContext(), mockExecutor);
let shouldRun = os.platform() === 'linux';
const installType: DotnetInstallMode = 'sdk';
const noDotnetString = `

Command 'dotnet' not found, but can be installed with:

            snap install dotnet-sdk # version 7.0.304, or

            apt install dotnet-host # version 6.0.118-06ubuntu1~22.04.1
            apt install dotnet-host-7.0 # version 7.0.107-6ubuntu1~22.04.1
            See 'snap info dotnet-sdk' for additional versions.
`

suite('Red Hat For Linux Distro Logic Unit Tests', function ()
{
    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('Package Check Succeeds', async () =>
    {
        shouldRun = os.platform() === 'linux' && (await versionResolver.getRunningDistro()).distro === RED_HAT_DISTRO_INFO_KEY;

        if (shouldRun)
        {
            // assert this passes : we don't want the test to be reliant on machine state for whether the package exists or not, so don't check output
            await provider.dotnetPackageExistsOnSystem(mockVersion, installType);
            assert.equal(mockExecutor.attemptedCommand, 'dnf list install dotnet-sdk-9.0 -q');
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
7.0.105 [/usr/lib/dotnet/sdk]
7.0.104 [/usr/custom/dotnet/sdk]`, stderr: '', status: '0'
            };
            let versions = await provider.getInstalledDotnetSDKVersions();
            mockExecutor.resetReturnValues();
            assert.deepStrictEqual(versions, ['7.0.105', '7.0.104']);

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
Microsoft.NETCore.App 6.0.16 [/usr/lib/dotnet/shared/Microsoft.NETCore.App]
Microsoft.NETCore.App 7.0.5 [/usr/lib/dotnet/shared/Microsoft.NETCore.App]`, stderr: '', status: '0'
            };
            let versions = await provider.getInstalledDotnetRuntimeVersions();
            mockExecutor.resetReturnValues();
            assert.deepStrictEqual(versions, ['6.0.16', '7.0.5']);

            mockExecutor.fakeReturnValue = { stdout: noDotnetString, stderr: noDotnetString, status: '0' };
            versions = await provider.getInstalledDotnetRuntimeVersions();
            mockExecutor.resetReturnValues();
            assert.deepStrictEqual(versions, []);
        }
    }).timeout(standardTimeoutTime);

    test('Looks for Global Dotnet Path Correctly', async () =>
    {
        if (shouldRun)
        {
            await provider.getInstalledGlobalDotnetPathIfExists(installType);
            assert.equal(mockExecutor.attemptedCommand, 'readlink -f /usr/bin/dotnet');
        }
    }).timeout(standardTimeoutTime);

    test('Finds Existing Global Dotnet Version', async () =>
    {
        if (shouldRun)
        {
            mockExecutor.fakeReturnValue = { stdout: `7.0.105`, status: '0', stderr: '' };
            let currentInfo = await provider.getInstalledGlobalDotnetVersionIfExists();
            mockExecutor.resetReturnValues();
            assert.equal(currentInfo, '7.0.105');

            mockExecutor.fakeReturnValue = { stdout: noDotnetString, stderr: noDotnetString, status: '0' };
            currentInfo = await provider.getInstalledGlobalDotnetVersionIfExists();
            mockExecutor.resetReturnValues();
            assert.equal(currentInfo, null);
        }
    }).timeout(standardTimeoutTime);

    test('Recommends Correct Version', async () =>
    {
        if (shouldRun)
        {
            const recVersion = await provider.getRecommendedDotnetVersion(installType);
            assert.equal(mockExecutor.attemptedCommand, 'dotnet --version', 'Correct command run to get recommended version, uses newest package in distro json');
            assert.equal(recVersion, '9.0.1xx', 'The most in support version is suggested : will eventually break if not updated');
        }
    }).timeout(standardTimeoutTime);

    test('Gives Correct Version Support Info', async () =>
    {
        if (shouldRun)
        {
            let supported = await provider.isDotnetVersionSupported('11.0.101', installType);
            // In the mock data, 8.0 is not supported, so it should be false.
            assert.equal(supported, false);
            supported = await provider.isDotnetVersionSupported('7.0.101', installType);
            assert.equal(supported, true);
            // this feature band isn't supported by most distros yet.
            supported = await provider.isDotnetVersionSupported('7.0.201', installType);
            assert.equal(supported, false);
        }
    }).timeout(standardTimeoutTime);

    test('Runs Correct Install Command', async () =>
    {
        if (shouldRun)
        {
            await provider.installDotnet(mockVersion, installType);
            assert.equal(mockExecutor.attemptedCommand, 'sudo dnf install -y dotnet-sdk-7.0');
        }
    }).timeout(standardTimeoutTime);

    test('Runs Correct Uninstall Command', async () =>
    {
        if (shouldRun)
        {
            await provider.uninstallDotnet(mockVersion, installType);
            assert.equal(mockExecutor.attemptedCommand, 'sudo dnf remove -y dotnet-sdk-7.0');
        }
    }).timeout(standardTimeoutTime);

    test('Runs Correct Update Command', async () =>
    {
        if (shouldRun)
        {
            await provider.upgradeDotnet(mockVersion, installType);
            assert.equal(mockExecutor.attemptedCommand, 'sudo dnf update -y dotnet-sdk-7.0');
        }
    }).timeout(standardTimeoutTime * 1000);
});
