/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DotnetPathFinder } from '../../Acquisition/DotnetPathFinder';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
import { MockCommandExecutor } from '../mocks/MockObjects';

const assert = chai.assert;
chai.use(chaiAsPromised);

suite('DotnetPathFinder Unit Tests', function ()
{
    const installRecordPath = `/etc/dotnet/install_location_${os.arch()}`;
    const installRecordPathNoArch = `/etc/dotnet/install_location`;
    const fakeDotnetPath = 'fake/dotnet';

    let madeFakeDotnetInstallRecord = false;
    let madeFakeDotnetDir = false;

    const mockContext = getMockAcquisitionContext('sdk', '8.0');
    const mockUtility = getMockUtilityContext();
    const mockExecutor = new MockCommandExecutor(mockContext, mockUtility);

    this.afterEach(async () =>
    {
        if(madeFakeDotnetInstallRecord && fs.existsSync(installRecordPath))
        {
            fs.rmSync(installRecordPath, { recursive: true });
        }

        if(madeFakeDotnetDir && fs.existsSync(madeFakeDotnetDir))
        {
            fs.rmdirSync(madeFakeDotnetDir, { recursive: true });
        }
    });


    test('It can find the hostfxr record on mac/linux', async () =>
    {
        // Make it look like theres an 8.0 install on the host in case we want to validate it if we ever want to add win32 test like so
        // mockExecutor.fakeReturnValue = { stdout: '8.0.101 [C:\\Program Files\\dotnet\\sdk]', stderr: '', status: '0' };
        if(os.platform() !== 'win32')
        {
            if (!fs.existsSync(installRecordPath))
            {
                madeFakeDotnetInstallRecord = true;
                if(!fs.existsSync(path.dirname(installRecordPath)))
                {
                    fs.mkdirSync(path.dirname(installRecordPath), { recursive: true });
                }
                fs.writeFileSync(path.join(installRecordPath), fakeDotnetPath);
            }

            const finder = new DotnetPathFinder(mockContext, mockUtility, mockExecutor);
            const result = await finder.findHostInstallPaths(os.arch());

            assert.isTrue(result !== undefined, 'The dotnet path finder found a dotnet path');

            if(madeFakeDotnetInstallRecord)
            {
                assert.equal(result?.at(0), fakeDotnetPath, 'The correct path is found');
            }
            else
            {
                console.warn('Cannot verify the correct install path is used since a legitimate install exists')
            }
        } // Windows and other lookup is covered in the registryReader or the runtime extension functional test
    }).timeout(10000 * 2);

    test('It can find the hostfxr record on mac/linux without arch', async () =>
    {
        if(os.platform() !== 'win32')
        {
            if (!fs.existsSync(installRecordPathNoArch))
            {
                madeFakeDotnetInstallRecord = true;
                if(!fs.existsSync(path.dirname(installRecordPathNoArch)))
                {
                    fs.mkdirSync(path.dirname(installRecordPathNoArch), { recursive: true });
                }
                fs.writeFileSync(path.join(installRecordPathNoArch), fakeDotnetPath);
            }

            const finder = new DotnetPathFinder(mockContext, mockUtility, mockExecutor);
            const result = await finder.findHostInstallPaths(os.arch());

            assert.isTrue(result !== undefined, 'The dotnet path finder found a dotnet path');

            if(!fs.existsSync(installRecordPath) && madeFakeDotnetInstallRecord)
            {
                assert.equal(result?.at(0), fakeDotnetPath, 'The correct path is found');
            }
            else
            {
                console.warn('Since there is a legitimate install native record, the test to validate finding a legacy non-native record will not be accurate');
            }
        }
    });
});
