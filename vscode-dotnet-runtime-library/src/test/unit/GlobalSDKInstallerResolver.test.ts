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


suite('Global SDK Installer Resolver Tests', () =>
{
    test('It finds the newest patch version given a feature band', async () => {

    });

    test('It finds the correct windows installer download url', async () => {

    });

    test('It finds the correct mac installer download url', async () => {

    });

    test('It detects if a conflicting SDK version exists', async () => {

    });

    test('It parses the major format', async () => {

    });

    test('It parses the major.minor format', async () => {

    });

    test('It parses the non specific feature band format', async () => {

    });
    test('It parses the fully specified format', async () => {

    });

});
