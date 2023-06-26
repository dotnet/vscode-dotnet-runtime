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

const mockVersion = '7.0.103';
const mockExecutor = new MockCommandExecutor();
const pair : DistroVersionPair = { distro : 'Ubuntu', version : '22.04' };
const provider : GenericDistroSDKProvider = new GenericDistroSDKProvider(pair, mockExecutor);


suite('Linux Version Resolver Tests', () =>
{
    test('It can determine the running distro', async () => {
        if(os.platform() === 'linux')
        {
        }
    });

    test('It rejects distro install if microsoft install exists', async () => {
        if(os.platform() === 'linux')
        {
        }
    });

    test('It rejects microsoft install if distro install exists', async () => {
        if(os.platform() === 'linux')
        {
        }
    });

    test('It rejects non 100 level feature band requests', async () => {
        if(os.platform() === 'linux')
        {
        }
    });

    test('It rejects installs if a custom install exists', async () => {
        if(os.platform() === 'linux')
        {
        }
    });

    test('It runs update if it can update instead of installing', async () => {
        if(os.platform() === 'linux')
        {
        }
    });

    test('It rejects if you try to install an unsupported version of dotnet on linux', async () => {
        if(os.platform() === 'linux')
        {
        }
    });

    test('It does not install if install already exists', async () => {
        if(os.platform() === 'linux')
        {
        }
    });

});
