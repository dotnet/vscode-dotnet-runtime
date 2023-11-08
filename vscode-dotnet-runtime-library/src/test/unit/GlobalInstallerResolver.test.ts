/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import { FileWebRequestWorker, MockEventStream, MockExtensionContext } from '../mocks/MockObjects';
import { GlobalInstallerResolver } from '../../Acquisition/GlobalInstallerResolver';
import path = require('path');
import { getMockAcquisitionContext } from './TestUtility';
const assert = chai.assert;

const mockVersion = '7.0.306';
const featureBandVersion = '7.0.1xx';
const newestFeatureBandedVersion = '7.0.109';
const majorOnly = '7';
const majorMinorOnly = '7.0';

const context = new MockExtensionContext();
const eventStream = new MockEventStream();
const acquisitionContext = getMockAcquisitionContext(true);
const filePath = path.join(__dirname, '../../..', 'src', 'test', 'mocks', 'mock-channel-7-index.json');
const webWorker = new FileWebRequestWorker(acquisitionContext, '', filePath);
const timeoutTime = 10000;

suite('Global Installer Resolver Tests', () =>
{
    test('It finds the newest patch version given a feature band', async () => {
        const provider : GlobalInstallerResolver = new GlobalInstallerResolver(acquisitionContext, featureBandVersion);
        provider.customWebRequestWorker = webWorker;

        assert.equal(await provider.getFullySpecifiedVersion(), newestFeatureBandedVersion);
    });

    test('It finds the correct installer download url for the os', async () => {
        const provider : GlobalInstallerResolver = new GlobalInstallerResolver(acquisitionContext, mockVersion);
        provider.customWebRequestWorker = webWorker;

        assert.equal(await provider.getFullySpecifiedVersion(), mockVersion);
        const installerUrl = await provider.getInstallerUrl();
        if(os.platform() === 'win32')
        {
            assert.include(installerUrl, 'exe');
        }
        else if(os.platform() === 'darwin')
        {
            assert.include(installerUrl, 'pkg');
        }
        // The architecture in the installer file will match unless its x32, in which case it'll be called x86.
        assert.include(installerUrl, (os.arch() === 'ia32' ? 'x86' : os.arch()));
    });

    test('It parses the major format', async () => {
        const provider : GlobalInstallerResolver = new GlobalInstallerResolver(acquisitionContext, majorMinorOnly);
        provider.customWebRequestWorker = webWorker;

        assert.equal(await provider.getFullySpecifiedVersion(), mockVersion);
    });

    test('It parses the major.minor format', async () => {
        const provider : GlobalInstallerResolver = new GlobalInstallerResolver(acquisitionContext, majorOnly);
        provider.customWebRequestWorker = webWorker;

        assert.equal(await provider.getFullySpecifiedVersion(), mockVersion);
    });

    test('It rejects correctly with undiscoverable feature band', async () => {
        const provider : GlobalInstallerResolver = new GlobalInstallerResolver(acquisitionContext, '7.0.500');
        provider.customWebRequestWorker = webWorker;

        assert.isRejected(provider.getFullySpecifiedVersion());
    });
});
