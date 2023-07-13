/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import { GenericDistroSDKProvider } from '../../Acquisition/GenericDistroSDKProvider';
import { FileWebRequestWorker, MockCommandExecutor, MockEventStream, MockExtensionContext, MockWebRequestWorker } from '../mocks/MockObjects';
import { DistroVersionPair, DotnetDistroSupportStatus } from '../../Acquisition/LinuxVersionResolver';
import { GlobalInstallerResolver } from '../../Acquisition/GlobalInstallerResolver';
import path = require('path');
const assert = chai.assert;

const mockVersion = '7.0.306';
const featureBandVersion = '7.0.1xx';
const newestFeatureBandedVersion = '7.0.109';
const majorOnly = '7';
const majorMinorOnly = '7.0';

const context = new MockExtensionContext();
const eventStream = new MockEventStream();
const filePath = path.join(__dirname, '../../..', 'src', 'test', 'mocks', 'mock-channel-7-index.json');
const webWorker = new FileWebRequestWorker(context, eventStream, filePath);


suite('Global Installer Resolver Tests', () =>
{
    test('It finds the newest patch version given a feature band', async () => {
        const provider : GlobalInstallerResolver = new GlobalInstallerResolver(context, eventStream, featureBandVersion);
        provider.customWebRequestWorker = webWorker;

        assert.equal(await provider.getFullVersion(), newestFeatureBandedVersion);
    });

    test('It finds the correct installer download url for the os', async () => {
        const provider : GlobalInstallerResolver = new GlobalInstallerResolver(context, eventStream, mockVersion);
        provider.customWebRequestWorker = webWorker;

        assert.equal(await provider.getFullVersion(), mockVersion);
        const installerUrl = await provider.getInstallerUrl();
        assert.include(installerUrl, (os.platform() === 'win32' ? 'exe' : 'pkg'));
        // The architecture in the installer file will match unless its x32, in which case itll be called x86.
        assert.include(installerUrl, (os.arch() === 'x32' ? 'x86' : os.arch()));
    });

    test('It parses the major format', async () => {
        const provider : GlobalInstallerResolver = new GlobalInstallerResolver(context, eventStream, majorMinorOnly);
        provider.customWebRequestWorker = webWorker;

        assert.equal(await provider.getFullVersion(), mockVersion);
    });

    test('It parses the major.minor format', async () => {
        const provider : GlobalInstallerResolver = new GlobalInstallerResolver(context, eventStream, majorOnly);
        provider.customWebRequestWorker = webWorker;

        assert.equal(await provider.getFullVersion(), mockVersion);
    });
});
