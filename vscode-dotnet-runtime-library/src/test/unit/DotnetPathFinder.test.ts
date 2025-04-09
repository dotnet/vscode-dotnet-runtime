/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as os from 'os';
import * as path from 'path';
import { DotnetPathFinder } from '../../Acquisition/DotnetPathFinder';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor, MockFileUtilities } from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';

const assert = chai.assert;
chai.use(chaiAsPromised);

suite('DotnetPathFinder Unit Tests', function ()
{
    const installRecordPath = `/etc/dotnet/install_location_${os.arch()}`;
    const installRecordPathNoArch = `/etc/dotnet/install_location`;
    const fakeDotnetPath = 'fake/dotnet';

    const mockContext = getMockAcquisitionContext('sdk', '8.0');
    const mockUtility = getMockUtilityContext();
    const mockExecutor = new MockCommandExecutor(mockContext, mockUtility);
    if (os.platform() !== 'win32')
    {
        mockExecutor.fakeReturnValue = { stdout: `Microsoft.NETCore.App 8.0.10 [${fakeDotnetPath}/shared/Microsoft.NetCoreApp.App]`, stderr: '', status: '0' };
    }

    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('It can find the hostfxr record on mac/linux', async () =>
    {
        // Make it look like theres an install on the host in case we want to validate it if we ever want to add win32 test like so
        if (os.platform() !== 'win32')
        {
            const mockFile = new MockFileUtilities();
            mockFile.filePathsAndExistValues[installRecordPath] = true;
            mockFile.filePathsAndExistValues[path.join(installRecordPath, fakeDotnetPath)] = true;
            mockFile.filePathsAndReadValues = { [installRecordPath]: fakeDotnetPath };

            const finder = new DotnetPathFinder(mockContext, mockUtility, mockExecutor, mockFile);
            const result = await finder.findHostInstallPaths(os.arch());

            assert.isTrue(result !== undefined, 'The dotnet path finder found a dotnet path');
            assert.equal(result?.[0], path.join(fakeDotnetPath, 'dotnet'), 'The correct path is found');
        } // Windows and other lookup is covered in the registryReader or the runtime extension functional test
    }).timeout(10000 * 2);

    test('It can find the hostfxr record on mac/linux without arch', async () =>
    {
        if (os.platform() !== 'win32')
        {

            const mockFile = new MockFileUtilities();
            mockFile.filePathsAndExistValues[installRecordPath] = false;
            mockFile.filePathsAndExistValues[installRecordPathNoArch] = true;
            mockFile.filePathsAndExistValues[path.join(installRecordPathNoArch, fakeDotnetPath)] = true;
            mockFile.filePathsAndReadValues = { [installRecordPathNoArch]: fakeDotnetPath };

            const finder = new DotnetPathFinder(mockContext, mockUtility, mockExecutor, mockFile);
            const result = await finder.findHostInstallPaths(os.arch());

            assert.isTrue(result !== undefined, 'The dotnet path finder found a dotnet path');
            assert.equal(result?.[0], path.join(fakeDotnetPath, 'dotnet'), 'The correct path is found');
        }
    });
});
