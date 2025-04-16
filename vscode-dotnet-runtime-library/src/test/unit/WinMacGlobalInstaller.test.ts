/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GetDotnetInstallInfo } from '../../Acquisition/DotnetInstall';
import { RegistryReader } from '../../Acquisition/RegistryReader';
import { WinMacGlobalInstaller } from '../../Acquisition/WinMacGlobalInstaller';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { FileUtilities } from '../../Utils/FileUtilities';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor, MockFileUtilities } from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
const assert = chai.assert;
const standardTimeoutTime = 100000;


suite('Windows & Mac Global Installer Tests', function ()
{
    this.retries(0);
    const mockVersion = '7.0.306';
    const mockUrl = 'https://download.visualstudio.microsoft.com/download/pr/4c0aaf08-3fa1-4fa0-8435-73b85eee4b32/e8264b3530b03b74b04ecfcf1666fe93/dotnet-sdk-7.0.306-win-x64.exe';
    const mockHash = '';
    const utilContext = getMockUtilityContext();
    const mockSdkContext = getMockAcquisitionContext('sdk', mockVersion);
    const mockExecutor = new MockCommandExecutor(mockSdkContext, utilContext);
    const mockFileUtils = new MockFileUtilities();
    const reader: RegistryReader = new RegistryReader(mockSdkContext, utilContext, mockExecutor);
    const installer: WinMacGlobalInstaller = new WinMacGlobalInstaller(getMockAcquisitionContext('sdk', mockVersion), getMockUtilityContext(), mockVersion, mockUrl, mockHash, mockExecutor, reader);
    installer.file = mockFileUtils;

    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('It detects if a conflicting SDK version exists for windows', async () =>
    {
        if (os.platform() === 'win32')
        {
            mockExecutor.fakeReturnValue = {
                stdout: `
           7.0.307    REG_DWORD    0x1
       `,
                status: '0',
                stderr: ''
            };

            let conflictExists = await installer.GlobalWindowsInstallWithConflictingVersionAlreadyExists(mockVersion);
            // The existing install is of a higher patch version than the attempted install, but the same band and major.minor.
            assert.deepStrictEqual(conflictExists, '7.0.307');
            assert.include(mockExecutor.attemptedCommand, 'query HKEY', 'it doesnt install if there is a conflicting install');

            // The major.minor is the same, but the band is not, so there is no conflict.
            mockExecutor.fakeReturnValue = {
                stdout: `
           7.0.201    REG_DWORD    0x1
       `,
                status: '0',
                stderr: ''
            };
            conflictExists = await installer.GlobalWindowsInstallWithConflictingVersionAlreadyExists(mockVersion);
            assert.deepStrictEqual(conflictExists, '', 'it finds no conflict with the same major.minor but different band');

            // Assert there is no conflict for upgrading to a newer patch version.
            mockExecutor.fakeReturnValue = {
                stdout: `
           7.0.301    REG_DWORD    0x1
        `,
                status: '0',
                stderr: ''
            };

            conflictExists = await installer.GlobalWindowsInstallWithConflictingVersionAlreadyExists(mockVersion);
            assert.deepStrictEqual(conflictExists, '', 'it finds no conflict with a newer patch version');

            // Assert that if an existing install exists it just exits ok
            mockExecutor.fakeReturnValue = {
                stdout: `
        ${mockVersion}    REG_DWORD    0x1
       `,
                status: '0',
                stderr: ''
            };

            const install = GetDotnetInstallInfo(mockVersion, 'sdk', 'global', os.arch());
            const result = await installer.installSDK(install);
            assert.exists(result);
            assert.equal(result, '0');

            // Assert the reg query was the last command, aka it never attempted to install because it didn't need to
            assert.include(mockExecutor.attemptedCommand, 'query HKEY', 'reg query is the last command since install is skipped');
        }
    });

    test('It runs the correct install command', async () =>
    {
        mockExecutor.fakeReturnValue = { stdout: `0`, status: '0', stderr: '' };
        installer.cleanupInstallFiles = false;
        const install = GetDotnetInstallInfo(mockVersion, 'sdk', 'global', os.arch());
        const result = await installer.installSDK(install);
        assert.exists(result);
        assert.equal(result, '0');

        if (os.platform() === 'darwin')
        {
            assert.isTrue(mockExecutor.attemptedCommand.startsWith('open'), `It ran the right mac command, open. Command found: ${mockExecutor.attemptedCommand}`);
            assert.isTrue(mockExecutor.attemptedCommand.includes('-W'), 'It used the -W flag');
            assert.isTrue(mockExecutor.attemptedCommand.includes('"'), 'It put the installer in quotes for username with space in it');
        }
        else if (os.platform() === 'win32')
        {
            const returnedPath = mockExecutor.attemptedCommand.split(' ')[0].slice(1, -1);
            assert.isTrue(fs.existsSync(returnedPath), `It ran a command to an executable that exists: ${returnedPath}`);
            assert.isTrue(mockExecutor.attemptedCommand.includes('"'), 'It put the installer in quotes for username with space in it');
            if (await new FileUtilities().isElevated(mockSdkContext, utilContext))
            {
                assert.include(mockExecutor.attemptedCommand, ' /quiet /install /norestart', 'It ran under the hood if it had privileges already');
            }
        }
        mockSdkContext
        // Rerun install to clean it up.
        installer.cleanupInstallFiles = true;
        await installer.installSDK(install);
        mockExecutor.resetReturnValues();
    }).timeout(150000);

    test('It downloads a file precisely and deletes installer downloads', async () =>
    {
        mockExecutor.fakeReturnValue = { status: '0', stderr: '', stdout: '' };
        installer.cleanupInstallFiles = false;
        const install = GetDotnetInstallInfo(mockVersion, 'sdk', 'global', os.arch());
        const result = await installer.installSDK(install);
        assert.exists(result, 'The installation on test was successful');
        assert.equal(result, '0', 'No errors were reported by the fake install');

        const installerDownloadFolder = path.resolve(__dirname, '../../Acquisition/', 'installers');
        const installersDir = WinMacGlobalInstaller.getDownloadedInstallFilesFolder(mockUrl);
        assert.equal(path.dirname(installersDir), installerDownloadFolder, 'The expected installer folder is used');

        assert.isTrue(fs.existsSync(installerDownloadFolder), 'install folder is created when we do not clean it up');


        installer.cleanupInstallFiles = true;
        await installer.installSDK(install);
        // The installer files should be removed. Note this doesn't really check the default as we changed it manually

        if (await new FileUtilities().isElevated(mockSdkContext, utilContext))
        {
            assert.equal(fs.readdirSync(installersDir).length, 0, `the installer file was deleted upon exit. files in ${installerDownloadFolder}:
${fs.readdirSync(installerDownloadFolder).join(', ')}`);
            mockExecutor.resetReturnValues();
        }
        else
        {
            console.warn('The check for installer file deletion cannot run without elevation.');
        }
    }).timeout(15000 * 3);

    test('It runs the correct uninstall command', async () =>
    {
        mockExecutor.fakeReturnValue = { stdout: `0`, status: '0', stderr: '' };
        installer.cleanupInstallFiles = false;
        const install = GetDotnetInstallInfo(mockVersion, 'sdk', 'global', os.arch());
        const result = await installer.uninstallSDK(install);
        assert.exists(result);
        assert.equal(result, '0');

        if (os.platform() === 'darwin')
        {
            assert.isTrue(mockExecutor.attemptedCommand.startsWith('sudo rm'), `It ran the right mac command, sudo rm. Command found: ${mockExecutor.attemptedCommand}`)
            assert.isTrue(mockExecutor.attemptedCommand.includes('rf'), 'It used the -rf flag')
        }
        else if (os.platform() === 'win32')
        {
            assert.isTrue(fs.existsSync(mockExecutor.attemptedCommand.split(' ')[0]), 'It ran a command to an executable that exists');
            if (await new FileUtilities().isElevated(mockSdkContext, utilContext))
            {
                assert.include(mockExecutor.attemptedCommand, ' /uninstall /passive /norestart', 'It ran under the hood if it had privileges already');
            }
            else
            {
                assert.include(mockExecutor.attemptedCommand, `/uninstall`, 'it tried to uninstall');
            }
        }

        // Rerun install to clean it up.
        installer.cleanupInstallFiles = true;
        await installer.installSDK(install);
        mockExecutor.resetReturnValues();
    }).timeout(150000);

    test('It will use arm64 emulation path IFF path does not exist and option to use it is set', async () =>
    {
        if (os.platform() === 'darwin')
        {
            const sdkVersionThatShouldNotExist = '3.0.500';
            const standardHostPath = path.resolve(`/usr/local/share/dotnet/dotnet`);
            const arm64EmulationHostPath = path.resolve(`/usr/local/share/dotnet/x64/dotnet`);

            let cleanUpPath = false;
            const defaultPath = await installer.getExpectedGlobalSDKPath(sdkVersionThatShouldNotExist, os.arch(), false);
            if (!fs.existsSync(arm64EmulationHostPath))
            {
                fs.mkdirSync(arm64EmulationHostPath, { recursive: true });
                cleanUpPath = true;
            }
            let shouldNotExistOptionPath = await installer.getExpectedGlobalSDKPath(sdkVersionThatShouldNotExist, os.arch());

            assert.equal(defaultPath, standardHostPath, 'It uses the standard path if false is set and path dne');
            assert.equal(shouldNotExistOptionPath, arm64EmulationHostPath, 'It uses the emu path if the std path does not exist and option is set');

            if (cleanUpPath)
            {
                fs.rmdirSync(arm64EmulationHostPath, { recursive: true });

                shouldNotExistOptionPath = await installer.getExpectedGlobalSDKPath(sdkVersionThatShouldNotExist, os.arch());
                assert.equal(shouldNotExistOptionPath, standardHostPath, 'It wont use the emu path if it does not exist');
            }
        }
    }).timeout(standardTimeoutTime);
});
