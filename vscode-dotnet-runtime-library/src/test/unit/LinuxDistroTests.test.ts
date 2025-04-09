/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import { DotnetInstallMode } from '../../Acquisition/DotnetInstallMode';
import { GenericDistroSDKProvider } from '../../Acquisition/GenericDistroSDKProvider';
import { DistroVersionPair, DotnetDistroSupportStatus } from '../../Acquisition/LinuxVersionResolver';
import * as versionUtils from '../../Acquisition/VersionUtilities';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor } from '../mocks/MockObjects';
import { UBUNTU_DISTRO_INFO_KEY } from '../../Acquisition/StringConstants';
import { getLatestLinuxDotnet, getLinuxSupportedDotnetSDKVersion, getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
import { getMajor, getMajorMinor } from '../../Acquisition/VersionUtilities';
const assert = chai.assert;
const standardTimeoutTime = 100000;

const mockVersion = '8.0.103';
const acquisitionContext = getMockAcquisitionContext('sdk', mockVersion);
const mockExecutor = new MockCommandExecutor(acquisitionContext, getMockUtilityContext());
const pair: DistroVersionPair = { distro: UBUNTU_DISTRO_INFO_KEY, version: '24.04' };
const provider: GenericDistroSDKProvider = new GenericDistroSDKProvider(pair, acquisitionContext, getMockUtilityContext(), mockExecutor);
const shouldRun = os.platform() === 'linux';
const installType: DotnetInstallMode = 'sdk';
const noDotnetString = `
Command 'dotnet' not found, but can be installed with:

            snap install dotnet-sdk # version 7.0.304, or

            apt install dotnet-host # version 6.0.118-06ubuntu1~24.04.1
            apt install dotnet-host-7.0 # version 7.0.107-6ubuntu1~24.04.1
            See 'snap info dotnet-sdk' for additional versions.
`

suite('Linux Distro Logic Unit Tests', function ()
{
    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('Recommends Correct Version', async () =>
    {
        if (shouldRun)
        {
            const recVersion = await provider.getRecommendedDotnetVersion(installType);
            const correctVersion = await getLinuxSupportedDotnetSDKVersion(acquisitionContext);
            const correctXXVersion = `${versionUtils.getMajorMinor(correctVersion, acquisitionContext.eventStream, acquisitionContext)}.1xx`;
            assert.equal(mockExecutor.attemptedCommand,
                `apt-cache -o DPkg::Lock::Timeout=180 search --names-only ^dotnet-sdk-${versionUtils.getMajorMinor(getLatestLinuxDotnet(), acquisitionContext.eventStream, acquisitionContext)}$`, 'Searched for the newest package last with regex'); // this may fail if test not exec'd first
            // the data is cached so --version may not be executed.
            assert.equal(recVersion, correctXXVersion, 'Resolved the most recent available version : will eventually break if the mock data is not updated');
        }
    }).timeout(standardTimeoutTime);

    test('Package Check Succeeds', async () =>
    {
        if (shouldRun)
        {
            // assert this passes : we don't want the test to be reliant on machine state for whether the package exists or not, so don't check output
            await provider.dotnetPackageExistsOnSystem(mockVersion, installType);
            const version = await getLinuxSupportedDotnetSDKVersion(acquisitionContext);
            assert.equal(mockExecutor.attemptedCommand, `dpkg -l dotnet-sdk-${versionUtils.getMajorMinor(version, acquisitionContext.eventStream, acquisitionContext)}`);
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
            assert.equal(distroFeedDir, '/usr/lib/dotnet');
        }
    }).timeout(standardTimeoutTime);

    test('Gets Microsoft Feed Install Dir', async () =>
    {
        if (shouldRun)
        {
            const microsoftFeedDir = await provider.getExpectedDotnetMicrosoftFeedInstallationDirectory();
            assert.equal(microsoftFeedDir, '/usr/share/dotnet');
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

            mockExecutor.fakeReturnValue = { stdout: noDotnetString, stderr: '', status: '0' };
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

            mockExecutor.fakeReturnValue = { stdout: noDotnetString, stderr: '', status: '0' };
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
            mockExecutor.fakeReturnValue = { stdout: mockVersion, stderr: '', status: '0' };
            let currentInfo = await provider.getInstalledGlobalDotnetVersionIfExists();
            mockExecutor.resetReturnValues();
            assert.equal(currentInfo, mockVersion);

            mockExecutor.fakeReturnValue = { stdout: noDotnetString, stderr: noDotnetString, status: '0' };
            currentInfo = await provider.getInstalledGlobalDotnetVersionIfExists();
            mockExecutor.resetReturnValues();
            assert.equal(currentInfo, null);
        }
    }).timeout(standardTimeoutTime);

    test('Gives Correct Version Support Info', async () =>
    {
        if (shouldRun)
        {
            const getPlusOneLatest = (Number(getMajor(getLatestLinuxDotnet(), acquisitionContext.eventStream, acquisitionContext)) + 1).toString() + '.0.100';
            let supported = await provider.isDotnetVersionSupported(getPlusOneLatest, installType);
            assert.equal(supported, false, '.net x+1 does not exist yet');
            supported = await provider.isDotnetVersionSupported(await getLinuxSupportedDotnetSDKVersion(acquisitionContext), installType);
            assert.equal(supported, true);

            // this feature band isn't supported by most distros yet.
            supported = await provider.isDotnetVersionSupported((await getLinuxSupportedDotnetSDKVersion(acquisitionContext)).replace('1', '2'), installType);
            assert.equal(supported, false);
        }
    }).timeout(standardTimeoutTime);

    test('Runs Correct Install Command', async () =>
    {
        if (shouldRun)
        {
            await provider.installDotnet(mockVersion, installType);
            assert.equal(mockExecutor.attemptedCommand, `sudo apt-get -o DPkg::Lock::Timeout=180 install -y dotnet-sdk-${versionUtils.getMajorMinor(mockVersion, acquisitionContext.eventStream, acquisitionContext)}`);
        }
    }).timeout(standardTimeoutTime);

    test('Runs Correct Uninstall Command', async () =>
    {
        if (shouldRun)
        {
            await provider.uninstallDotnet(mockVersion, installType);
            assert.equal(mockExecutor.attemptedCommand, `sudo apt-get -o DPkg::Lock::Timeout=180 remove -y dotnet-sdk-${versionUtils.getMajorMinor(mockVersion, acquisitionContext.eventStream, acquisitionContext)}`);
        }
    }).timeout(standardTimeoutTime);

    test('Runs Correct Update Command', async () =>
    {
        if (shouldRun)
        {
            await provider.upgradeDotnet(mockVersion, installType);
            assert.equal(mockExecutor.attemptedCommand, `sudo apt-get -o DPkg::Lock::Timeout=180 upgrade -y dotnet-sdk-${versionUtils.getMajorMinor(mockVersion, acquisitionContext.eventStream, acquisitionContext)}`);
        }
    }).timeout(standardTimeoutTime * 1000);
});
