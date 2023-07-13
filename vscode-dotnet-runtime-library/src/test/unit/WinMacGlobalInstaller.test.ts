/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { MockCommandExecutor, MockEventStream, MockExtensionContext, MockInstallationValidator, NoInstallAcquisitionInvoker } from '../mocks/MockObjects';
import { WinMacGlobalInstaller } from '../../Acquisition/WinMacGlobalInstaller';
import { RuntimeInstallationDirectoryProvider } from '../../Acquisition/RuntimeInstallationDirectoryProvider';
import { SdkInstallationDirectoryProvider } from '../../Acquisition/SdkInstallationDirectoryProvider';
import { IAcquisitionWorkerContext } from '../../Acquisition/IAcquisitionWorkerContext';
import { FileUtilities } from '../../Utils/FileUtilities';
const assert = chai.assert;
const standardTimeoutTime = 100000;

suite('Windows & Mac Global Installer Tests', () =>
{
    function mockContext(runtimeInstall: boolean): IAcquisitionWorkerContext {
        const extensionContext = new MockExtensionContext();
        const eventStream = new MockEventStream();
        const workerContext : IAcquisitionWorkerContext = {
            storagePath: '',
            extensionState: extensionContext,
            eventStream,
            acquisitionInvoker: new NoInstallAcquisitionInvoker(eventStream),
            installationValidator: new MockInstallationValidator(eventStream),
            timeoutValue: standardTimeoutTime,
            installDirectoryProvider: runtimeInstall ? new RuntimeInstallationDirectoryProvider('') : new SdkInstallationDirectoryProvider(''),
        };
        return workerContext;
    }

    const mockVersion = '7.0.306';
    const mockUrl = 'https://download.visualstudio.microsoft.com/download/pr/4c0aaf08-3fa1-4fa0-8435-73b85eee4b32/e8264b3530b03b74b04ecfcf1666fe93/dotnet-sdk-7.0.306-win-x64.exe';
    const mockExecutor = new MockCommandExecutor();
    const installer : WinMacGlobalInstaller = new WinMacGlobalInstaller(mockContext(false), mockVersion, mockUrl, mockExecutor);

    test('It reads SDK registry entries correctly on windows', async () =>
    {
        if(os.platform() === 'win32')
        {
            // 32 and 64 bit sdks exist
            mockExecutor.fakeReturnValue = `
            5.0.416    REG_DWORD    0x1
            8.0.100-preview.5.23265.7    REG_DWORD    0x1
            7.0.301    REG_DWORD    0x1
            6.0.416    REG_DWORD    0x1
            7.0.109    REG_DWORD    0x1
            7.0.304    REG_DWORD    0x1

        `;
            let foundVersions = await installer.getGlobalSdkVersionsInstalledOnMachine();
            assert.deepStrictEqual(foundVersions, ['5.0.416', '8.0.100-preview.5.23265.7', '7.0.301', '6.0.416', '7.0.109', '7.0.304']);
            assert.include(mockExecutor.attemptedCommand, 'reg.exe query "HKEY');

            // only 1 64 bit sdks exist
            mockExecutor.fakeReturnValue = `
            7.0.301    REG_DWORD    0x1
        `;
            mockExecutor.otherCommandsToMock = ['x86'] // make the 32 bit query error / have no result
            mockExecutor.otherCommandsReturnValues = [`ERROR: The system was unable to find the specified registry key or value.`];
            foundVersions = await installer.getGlobalSdkVersionsInstalledOnMachine();
            assert.deepStrictEqual(foundVersions, ['7.0.301']);

            // no sdks exist
            // Try throwing for  64 bit, and returning empty for 32 bit
            mockExecutor.fakeReturnValue = `ERROR: The system was unable to find the specified registry key or value.`;
            mockExecutor.otherCommandsReturnValues = [``];
            foundVersions = await installer.getGlobalSdkVersionsInstalledOnMachine();
            assert.deepStrictEqual(foundVersions, []);
            mockExecutor.fakeReturnValue = ``;

            mockExecutor.otherCommandsToMock = [];
            mockExecutor.otherCommandsReturnValues = [];

            // Assert that it passes when running the command for real
            foundVersions = await installer.getGlobalSdkVersionsInstalledOnMachine();
            assert.exists(foundVersions);
        }
    });

    test('It detects if a conflicting SDK version exists for windows', async () =>
    {
        if(os.platform() === 'win32')
        {
           mockExecutor.fakeReturnValue = `
           7.0.307    REG_DWORD    0x1
       `;
           let conflictExists = await installer.GlobalWindowsInstallWithConflictingVersionAlreadyExists(mockVersion);
           // The existing install is of a higher patch version than the attempted install, but the same band and major.minor.
           assert.deepStrictEqual(conflictExists, '7.0.307');
           assert.include(mockExecutor.attemptedCommand, 'reg.exe query "HKEY');
           mockExecutor.fakeReturnValue = ``;

           // The major.minor is the same, but the band is not, so there is no conflict.
           mockExecutor.fakeReturnValue = `
           7.0.201    REG_DWORD    0x1
       `;
           conflictExists = await installer.GlobalWindowsInstallWithConflictingVersionAlreadyExists(mockVersion);
           assert.deepStrictEqual(conflictExists, '');

           // Assert there is no conflict for upgrading to a newer patch version.
           mockExecutor.fakeReturnValue = `
           7.0.301    REG_DWORD    0x1
        `;
           conflictExists = await installer.GlobalWindowsInstallWithConflictingVersionAlreadyExists(mockVersion);
           assert.deepStrictEqual(conflictExists, '');

           // Assert that if an existing install exists it just exits ok
           mockExecutor.fakeReturnValue = `
           ${mockVersion}    REG_DWORD    0x1
       `;

           let result = await installer.installSDK();
           assert.exists(result);
           assert.equal(result, '0');

           // Assert the reg query was the last command, aka it never attempted to install because it didn't need to
           assert.include(mockExecutor.attemptedCommand, 'reg.exe query "HKEY');
        }
    });

    test('It runs the correct install command', async () =>
    {
        mockExecutor.fakeReturnValue = `0`;
        installer.cleanupInstallFiles = false;
        let result = await installer.installSDK();
        assert.exists(result);
        assert.equal(result, '0');

        if(os.platform() === 'darwin')
        {
            assert.isTrue(mockExecutor.attemptedCommand.startsWith('open -W'), 'It ran the right mac command')
        }
        else if(os.platform() === 'win32')
        {
            assert.isTrue(fs.existsSync(mockExecutor.attemptedCommand.split(' ')[0]), 'It ran a command to an executable that exists');
            if(FileUtilities.isElevated())
            {
                assert.include(mockExecutor.attemptedCommand, ' /quiet /install /norestart', 'It ran under the hood if it had privelleges already');
            }
        }

        // Rerun install to clean it up.
        installer.cleanupInstallFiles = true;
        await installer.installSDK();
        mockExecutor.fakeReturnValue = ``;
    });

    test('It downloads a file precisely and deletes installer downloads', async () =>
    {
        mockExecutor.fakeReturnValue = `0`;
        installer.cleanupInstallFiles = false;
        let result = await installer.installSDK();
        assert.exists(result, 'The installation on test was successful');
        assert.equal(result, '0', 'No errors were reported by the fake install');

        const installerDownloadFolder = path.resolve(__dirname, '../../Acquisition/', 'installers');
        const installersDir = WinMacGlobalInstaller.getDownloadedInstallFilesFolder();
        assert.equal(installerDownloadFolder, installersDir, 'The expected installer folder is used');

        assert.isTrue(fs.existsSync(installerDownloadFolder), 'install folder is created when we dont clean it up');


        installer.cleanupInstallFiles = true;
        await installer.installSDK();
        // The installer files should be removed. Note this doesnt really check the default as we changed it manually
        assert.equal(fs.readdirSync(installerDownloadFolder).length, 0, 'the installer file was deleted upon exit');
        mockExecutor.fakeReturnValue = ``;

    });
});
