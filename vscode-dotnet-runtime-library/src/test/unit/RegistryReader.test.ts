/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as chai from 'chai';
import * as os from 'os';
import { MockCommandExecutor } from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
import { RegistryReader } from '../../Acquisition/RegistryReader';
const assert = chai.assert;
const standardTimeoutTime = 100000;


suite('RegistryReader Tests', () =>
{
    const mockVersion = '7.0.306';
    const mockExecutor = new MockCommandExecutor(getMockAcquisitionContext('sdk', mockVersion), getMockUtilityContext());
    const reader : RegistryReader = new RegistryReader(getMockAcquisitionContext('sdk', mockVersion), getMockUtilityContext(), mockExecutor);

    test('It reads SDK registry entries correctly on windows', async () =>
    {
        if(os.platform() === 'win32')
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
            mockExecutor.otherCommandsReturnValues = [{stderr: `ERROR: The system was unable to find the specified registry key or value.`, status: '1', stdout: ''}];
            foundVersions = await reader.getGlobalSdkVersionsInstalledOnMachine();
            assert.deepStrictEqual(foundVersions, ['7.0.301'], 'it handles 32 bit sdk not found');

            // no sdks exist
            // Try throwing for  64 bit, and returning empty for 32 bit
            mockExecutor.fakeReturnValue = {stdout: `ERROR: The system was unable to find the specified registry key or value.`, status: '1', stderr: ''};
            mockExecutor.otherCommandsReturnValues = [{stdout: '', status: '0', stderr: ''}];
            foundVersions = await reader.getGlobalSdkVersionsInstalledOnMachine();
            assert.deepStrictEqual(foundVersions, [], 'it finds nothing with empty string and or error status');

            mockExecutor.resetReturnValues();
            // Assert that it passes when running the command for real
            foundVersions = await reader.getGlobalSdkVersionsInstalledOnMachine();
            assert.exists(foundVersions);
        }
    });
});
