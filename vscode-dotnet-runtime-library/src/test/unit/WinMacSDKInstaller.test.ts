/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import * as GenericDistroSDKProvider from '../../Acquisition/GenericDistroSDKProvider';
import { FileWebRequestWorker, MockCommandExecutor, MockEventStream, MockExtensionContext, MockInstallationValidator, MockWebRequestWorker, NoInstallAcquisitionInvoker } from '../mocks/MockObjects';
import path = require('path');
import { WinMacGlobalInstaller } from '../../Acquisition/WinMacGlobalInstaller';
import { RuntimeInstallationDirectoryProvider } from '../../Acquisition/RuntimeInstallationDirectoryProvider';
import { SdkInstallationDirectoryProvider } from '../../Acquisition/SdkInstallationDirectoryProvider';
import { IAcquisitionWorkerContext } from '../../Acquisition/IAcquisitionWorkerContext';
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
    const mockUrl = 'installerfile';
    const context = new MockExtensionContext();
    const eventStream = new MockEventStream();
    const filePath = path.join(__dirname, '..', 'mocks', 'mock-releases.json');
    const webWorker = new FileWebRequestWorker(context, eventStream, filePath);

    const installer : WinMacGlobalInstaller = new WinMacGlobalInstaller(mockContext(false), mockVersion, mockUrl);

    test('It detects if a conflicting SDK version exists for windows', async () => {
        if(os.platform() === 'win32')
        {
            throw Error('');
        }
    });
});
