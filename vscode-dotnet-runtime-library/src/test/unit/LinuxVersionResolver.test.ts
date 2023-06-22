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


suite('Linux SDK Resolver Tests', () =>
{
    test('Package Check Succeeds', async () => {
        if(os.platform() === 'linux')
        {
        }
    });
});
