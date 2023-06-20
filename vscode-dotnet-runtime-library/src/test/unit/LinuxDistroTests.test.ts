/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import { GenericDistroSDKProvider } from '../../Acquisition/GenericDistroSDKProvider';
import { MockCommandExecutor } from '../mocks/MockObjects';
const assert = chai.assert;
const standardTimeoutTime = 100000;

suite('Linux Distro Logic Unit Tests', () =>
{
    test('Distro Provider Runs Commands Successfully', async () => {
        if(os.platform() === 'linux')
        {
            const mockExecutor : MockCommandExecutor();
            let pair : DistroVersionPair = { distro : 'Ubuntu', version : '22.04' };

            const provider : GenericDistroSDKProvider = new GenericDistroSDKProvider(pair, mockExecutor);

        }
    }).timeout(standardTimeoutTime*1000);

});
