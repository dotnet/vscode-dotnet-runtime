/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as chai from 'chai';
import * as os from 'os';
import { RegistryReader } from '../../Acquisition/RegistryReader';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor } from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
const assert = chai.assert;
const standardTimeoutTime = 100000;


suite('RegistryReader Tests', function ()
{
    const mockVersion = '7.0.306';
    const mockExecutor = new MockCommandExecutor(getMockAcquisitionContext('sdk', mockVersion), getMockUtilityContext());
    const reader: RegistryReader = new RegistryReader(getMockAcquisitionContext('sdk', mockVersion), getMockUtilityContext(), mockExecutor);
    const thisArch = os.arch();
    const notThisArch = thisArch === 'x64' ? 'arm64' : 'x64';

    this.afterEach(async () =>
    {
        LocalMemoryCacheSingleton.getInstance().invalidate();
        WebRequestWorkerSingleton.getInstance().destroy();
    });

    test('It reads SDK registry entries correctly on windows', async () =>
    {
        if (os.platform() === 'win32')
        {
            // 32 and 64 bit sdks exist
            mockExecutor.fakeReturnValue = {
                stdout: `
            5.0.416    REG_DWORD    0x1
            8.0.100-preview.5.23265.7    REG_DWORD    0x1
            7.0.301    REG_DWORD    0x1
            6.0.416    REG_DWORD    0x1
            7.0.109    REG_DWORD    0x1
            7.0.304    REG_DWORD    0x1

        `,
                status: '0',
                stderr: ''
            };

            let foundVersions = await reader.getGlobalSdkVersionsInstalledOnMachine();
            assert.deepStrictEqual(foundVersions, ['5.0.416', '8.0.100-preview.5.23265.7', '7.0.301', '6.0.416', '7.0.109', '7.0.304']);
            assert.include(mockExecutor.attemptedCommand, 'query HKEY', 'it finds sdks on the machine');

            // only 1 64 bit sdks exist
            mockExecutor.fakeReturnValue = {
                stdout: `
            7.0.301    REG_DWORD    0x1
        `,
                status: '0',
                stderr: ''
            };
            mockExecutor.otherCommandPatternsToMock = ['x86'] // make the 32 bit query error / have no result
            mockExecutor.otherCommandsReturnValues = [{ stderr: `ERROR: The system was unable to find the specified registry key or value.`, status: '1', stdout: '' }];
            foundVersions = await reader.getGlobalSdkVersionsInstalledOnMachine();
            assert.deepStrictEqual(foundVersions, ['7.0.301'], 'it handles 32 bit sdk not found');

            // no sdks exist
            // Try throwing for  64 bit, and returning empty for 32 bit
            mockExecutor.fakeReturnValue = { stdout: `ERROR: The system was unable to find the specified registry key or value.`, status: '1', stderr: '' };
            mockExecutor.otherCommandsReturnValues = [{ stdout: '', status: '0', stderr: '' }];
            foundVersions = await reader.getGlobalSdkVersionsInstalledOnMachine();
            assert.deepStrictEqual(foundVersions, [], 'it finds nothing with empty string and or error status');

            mockExecutor.resetReturnValues();
            // Assert that it passes when running the command for real
            foundVersions = await reader.getGlobalSdkVersionsInstalledOnMachine();
            assert.exists(foundVersions);
        }
    });

    test('It finds .NET host Path correctly', async () =>
    {
        if (os.platform() === 'win32')
        {
            const mockThisArchHostPath = 'C:\\Program Files\\dotnet\\dotnet.exe';
            const mockNotThisArchHostPath = 'C:\\Program Files\\dotnet\\x64\\dotnet.exe';

            mockExecutor.fakeReturnValue = {
                stdout: `
    Path    REG_SZ    ${mockThisArchHostPath}
        `,
                status: '0',
                stderr: ''
            };

            // Test logic for sharedhost
            const firstRes = await reader.getHostLocation(thisArch);
            assert.exists(firstRes, 'It found something for sharedhost');
            assert.strictEqual(firstRes, mockThisArchHostPath, 'It found the correct path for sharedhost');

            mockExecutor.fakeReturnValue = {
                stdout: `
HKEY_LOCAL_MACHINE\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x64
    InstallLocation    REG_SZ    ${mockNotThisArchHostPath}

        `,
                status: '0',
                stderr: ''
            };

            // Test logic for InstallLocation
            const secondRes = await reader.getHostLocation(notThisArch);
            assert.exists(secondRes, 'It found something for InstallLocation');
            assert.equal(secondRes, mockNotThisArchHostPath, 'It found the correct path for InstallLocation');

            mockExecutor.resetReturnValues();
        }
    });

    test('It uses reg32 WOW as backup', async () =>
    {
        if (os.platform() === 'win32')
        {
            const correctPath = 'C:\\Program Files\\foo\\dotnet.exe';
            // only 1 64 bit sdks exist
            mockExecutor.fakeReturnValue = {
                stdout: `HKEY_LOCAL_MACHINE\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x64
    Path    REG_SZ    C:\\Program Files\\dotnet\\dotnet.exe
        `,
                status: '1',
                stderr: `ERROR: The system was unable to find the specified registry key or value.` // wont happen at the same time, but this is a mock so its ok
            };

            mockExecutor.otherCommandPatternsToMock = ['InstallLocation'];
            mockExecutor.otherCommandsReturnValues = [{
                stderr: ``, status: '0', stdout: `
                    InstallLocation    REG_SZ    ${correctPath}
            `}];

            const res = await reader.getHostLocation(thisArch);

            assert.exists(res, 'It found something');
            assert.equal(res, correctPath, 'It found the correct path falling back to InstallLocation if no sharedhost key is found');
            mockExecutor.resetReturnValues();
        }
    });
});
