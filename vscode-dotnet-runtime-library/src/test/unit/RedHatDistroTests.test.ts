/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import { GenericDistroSDKProvider } from '../../Acquisition/GenericDistroSDKProvider';
import { MockCommandExecutor } from '../mocks/MockObjects';
import { DistroVersionPair, DotnetDistroSupportStatus } from '../../Acquisition/LinuxVersionResolver';
import { getMockAcquiringContext } from './TestUtility';
import { RedHatDistroSDKProvider } from '../../Acquisition/RedHatDistroSDKProvider';
const assert = chai.assert;
const standardTimeoutTime = 100000;

const mockVersion = '7.0.103';
const mockExecutor = new MockCommandExecutor();
const pair : DistroVersionPair = { distro : 'Red Hat Enterprise Linux', version : '9.1' };
const provider : RedHatDistroSDKProvider = new RedHatDistroSDKProvider(pair, getMockAcquiringContext(false), mockExecutor);
const shouldRun = os.platform() === 'linux';

const noDotnetString = `
Command 'dotnet' not found, but can be installed with:

            snap install dotnet-sdk # version 7.0.304, or

            apt install dotnet-host # version 6.0.118-06ubuntu1~22.04.1
            apt install dotnet-host-7.0 # version 7.0.107-6ubuntu1~22.04.1
            See 'snap info dotnet-sdk' for additional versions.
`

suite('Red Hat Distro Logic Unit Tests', () =>
{
    test('Package Check Succeeds', async () => {
        if(shouldRun)
        {
            // assert this passes : we don't want the test to be reliant on machine state for whether the package exists or not, so don't check output
            await provider.dotnetPackageExistsOnSystem(mockVersion);
            assert.equal(mockExecutor.attemptedCommand, 'yum list installed dotnet-sdk-7.0');
        }
    });

    test('Support Status Check', async () => {
        if(shouldRun)
        {
            const status = await provider.getDotnetVersionSupportStatus(mockVersion);
            assert.equal(status, DotnetDistroSupportStatus.Distro);
        }
    });

    test('Gets Distro Feed Install Dir', async () => {
        if(shouldRun)
        {
            const distroFeedDir = await provider.getExpectedDotnetDistroFeedInstallationDirectory();
            assert.equal(distroFeedDir, '/usr/lib64/dotnet/sdk');
        }
    });

    test('Gets Installed SDKs', async () =>
    {
        if(shouldRun)
        {
            mockExecutor.fakeReturnValue = `
7.0.111 [/usr/lib64/dotnet/sdk]
            `;
            let versions = await provider.getInstalledDotnetSDKVersions();
            mockExecutor.fakeReturnValue = '';
            assert.deepStrictEqual(versions, ['7.0.111']);

            mockExecutor.fakeReturnValue = noDotnetString;
            versions = await provider.getInstalledDotnetSDKVersions();
            mockExecutor.fakeReturnValue = '';
            assert.deepStrictEqual(versions, []);
        }
    });

    test('Gets Installed Runtimes', async () => {
        if(shouldRun)
        {
            mockExecutor.fakeReturnValue = `
Microsoft.AspNetCore.App 7.0.11 [/usr/lib64/dotnet/shared/Microsoft.AspNetCore.App]
Microsoft.NETCore.App 7.0.11 [/usr/lib64/dotnet/shared/Microsoft.NETCore.App]
            `;
            let versions = await provider.getInstalledDotnetRuntimeVersions();
            mockExecutor.fakeReturnValue = '';
            assert.deepStrictEqual(versions, ['7.0.11', '7.0.11']);

            mockExecutor.fakeReturnValue = noDotnetString;
            versions = await provider.getInstalledDotnetRuntimeVersions();
            mockExecutor.fakeReturnValue = '';
            assert.deepStrictEqual(versions, []);
        }
    });

    test('Looks for Global Dotnet Path Correctly', async () => {
        if(shouldRun)
        {
            await provider.getInstalledGlobalDotnetPathIfExists();
            assert.equal(mockExecutor.attemptedCommand, 'which dotnet');
        }
    });

    test('Finds Existing Global Dotnet Version', async () => {
        if(shouldRun)
        {
            mockExecutor.fakeReturnValue = `7.0.105`;
            let currentInfo = await provider.getInstalledGlobalDotnetVersionIfExists();
            mockExecutor.fakeReturnValue = '';
            assert.equal(currentInfo, '7.0.105');

            mockExecutor.fakeReturnValue = noDotnetString;
            currentInfo = await provider.getInstalledGlobalDotnetVersionIfExists();
            mockExecutor.fakeReturnValue = '';
            assert.equal(currentInfo, null);
        }
    });

    test('Recommends Correct Version', async () => {
        if(shouldRun)
        {
            const recVersion = provider.getRecommendedDotnetVersion();
            assert.equal(recVersion, '7.0.1xx');
        }
    });

    test('Gives Correct Version Support Info', async () => {
        if(shouldRun)
        {
            let supported = await provider.isDotnetVersionSupported('8.0.101');
            // In the mock data, 8.0 is not supported, so it should be false.
            assert.equal(supported, false);
            supported = await provider.isDotnetVersionSupported('7.0.101');
            assert.equal(supported, true);
            // this feature band isn't supported by most distros yet.
            supported = await provider.isDotnetVersionSupported('7.0.201');
            assert.equal(supported, false);
        }
    });

    test('Runs Correct Install Command', async () => {
        if(shouldRun)
        {
            await provider.installDotnet(mockVersion);
            assert.equal(mockExecutor.attemptedCommand, 'sudo dnf install dotnet-sdk-7.0 -y');
        }
    });

    test('Runs Correct Uninstall Command', async () => {
        if(shouldRun)
        {
            await provider.uninstallDotnet(mockVersion);
            assert.equal(mockExecutor.attemptedCommand, 'sudo dnf remove dotnet-sdk-7.0 -y');
        }
    });

    test('Runs Correct Update Command', async () => {
        if(shouldRun)
        {
            await provider.upgradeDotnet(mockVersion);
            assert.equal(mockExecutor.attemptedCommand, 'sudo dnf update dotnet-sdk-7.0 -y');
        }
    }).timeout(standardTimeoutTime*1000);
});