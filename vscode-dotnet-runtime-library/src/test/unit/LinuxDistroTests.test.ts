/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import { GenericDistroSDKProvider } from '../../Acquisition/GenericDistroSDKProvider';
import { MockCommandExecutor } from '../mocks/MockObjects';
import { DistroVersionPair, DotnetDistroSupportStatus } from '../../Acquisition/LinuxVersionResolver';
const assert = chai.assert;
const standardTimeoutTime = 100000;

const mockVersion = '7.0.103';
const mockExecutor = new MockCommandExecutor();
const pair : DistroVersionPair = { distro : 'Ubuntu', version : '22.04' };
const provider : GenericDistroSDKProvider = new GenericDistroSDKProvider(pair, mockExecutor);
const shouldRun = os.platform() === 'linux';

const noDotnetString = `
Command 'dotnet' not found, but can be installed with:

            snap install dotnet-sdk # version 7.0.304, or

            apt install dotnet-host # version 6.0.118-06ubuntu1~22.04.1
            apt install dotnet-host-7.0 # version 7.0.107-6ubuntu1~22.04.1
            See 'snap info dotnet-sdk' for additional versions.
`

suite('Linux Distro Logic Unit Tests', () =>
{

    test('Package Check Succeeds', async () => {
        if(shouldRun)
        {
            // assert this passes : we dont want the test to be reliant on machine state for whether the package exists or not, so dont check output
            await provider.dotnetPackageExistsOnSystem(mockVersion);
            assert.equal(mockExecutor.attemptedCommand, "dpkg -l dotnet-sdk-7.0");
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
            assert.equal(distroFeedDir, '/usr/lib/dotnet/sdk');
        }
    });

    test('Gets Microsoft Feed Install Dir', async () => {
        if(shouldRun)
        {
            const microsoftFeedDir = await provider.getExpectedDotnetMicrosoftFeedInstallationDirectory();
            assert.equal(microsoftFeedDir, '/usr/bin/dotnet');
        }
    });

    test('Gets Installed SDKs', async () => {
        if(shouldRun)
        {
            mockExecutor.fakeReturnValue = `
7.0.105 [/usr/lib/dotnet/sdk]
7.0.104 [/usr/custom/dotnet/sdk]`;
            let versions = await provider.getInstalledDotnetSDKVersions();
            mockExecutor.fakeReturnValue = '';
            assert.deepStrictEqual(versions, ['7.0.105', '7.0.104']);

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
Microsoft.NETCore.App 6.0.16 [/usr/lib/dotnet/shared/Microsoft.NETCore.App]
Microsoft.NETCore.App 7.0.5 [/usr/lib/dotnet/shared/Microsoft.NETCore.App]`;
            let versions = await provider.getInstalledDotnetRuntimeVersions();
            mockExecutor.fakeReturnValue = '';
            assert.deepStrictEqual(versions, ['6.0.16', '7.0.5']);

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
            const recoVersion = provider.getRecommendedDotnetVersion();
            assert.equal(recoVersion, '7.0.1xx');
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
            // this feature band isnt supported by most distros yet.
            supported = await provider.isDotnetVersionSupported('7.0.201');
            assert.equal(supported, false);
        }
    });

    test('Runs Correct Install Command', async () => {
        if(shouldRun)
        {
            await provider.installDotnet(mockVersion);
            assert.equal(mockExecutor.attemptedCommand, 'sudo apt-get update && sudo apt-get install -y dotnet-sdk-7.0');
        }
    });

    test('Runs Correct Uninstall Command', async () => {
        if(shouldRun)
        {
            await provider.uninstallDotnet(mockVersion);
            assert.equal(mockExecutor.attemptedCommand, 'sudo apt-get remove dotnet-sdk-7.0');

        }
    });

    test('Runs Correct Update Command', async () => {
        if(shouldRun)
        {
            await provider.upgradeDotnet(mockVersion);
            assert.equal(mockExecutor.attemptedCommand, 'sudo apt-get update && apt-get upgrade -y dotnet-sdk-7.0');
        }
    }).timeout(standardTimeoutTime*1000);

});
