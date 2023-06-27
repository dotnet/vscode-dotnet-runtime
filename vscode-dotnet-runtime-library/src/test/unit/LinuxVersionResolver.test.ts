/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import { GenericDistroSDKProvider } from '../../Acquisition/GenericDistroSDKProvider';
import { MockCommandExecutor, MockDistroProvider, MockEventStream, MockExtensionContext, MockInstallationValidator, NoInstallAcquisitionInvoker } from '../mocks/MockObjects';
import { DistroVersionPair, DotnetDistroSupportStatus, LinuxVersionResolver } from '../../Acquisition/LinuxVersionResolver';
import { IAcquisitionWorkerContext } from '../../Acquisition/IAcquisitionWorkerContext';
import { RuntimeInstallationDirectoryProvider } from '../../Acquisition/RuntimeInstallationDirectoryProvider';
import { SdkInstallationDirectoryProvider } from '../../Acquisition/SdkInstallationDirectoryProvider';
const assert = chai.assert;
const standardTimeoutTime = 100000;



suite('Linux Version Resolver Tests', () =>
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

    const mockVersion = '7.0.103';
    const mockExecutor = new MockCommandExecutor();
    const pair : DistroVersionPair = { distro : 'Ubuntu', version : '22.04' };
    const shouldRun = os.platform() === 'linux';
    let mockDistroProvider = new MockDistroProvider(pair);
    const resolver : LinuxVersionResolver = new LinuxVersionResolver(mockContext(false), mockExecutor, mockDistroProvider);

    test('It can determine the running distro', async () => {
        if(shouldRun)
        {
            const distroVersion = await resolver.getRunningDistro();
            assert.equal(mockExecutor.attemptedCommand, "cat /etc/os-release");
            assert.exists(distroVersion.distro);
            assert.exists(distroVersion.version);
        }
    });

    test('It rejects distro install if microsoft install exists', async () => {
        if(shouldRun)
        {
            mockDistroProvider.distroFeedReturnValue = `/`;
            // We pass root as the directory where we'd expect a copy of dotnet if it were installed thru the package manager.
            // Root must exist so we should fail. This is not where dotnet would really go.
            assert.isRejected(resolver.ValidateAndInstallSDK(mockVersion), Error, resolver.conflictingInstallErrorMessage + '/');
            mockDistroProvider.distroFeedReturnValue = ``;
        }
    });

    test('It rejects microsoft install if distro install exists', async () => {
        if(shouldRun)
        {
            mockDistroProvider.microsoftFeedReturnValue = `/`;
            assert.isRejected(resolver.ValidateAndInstallSDK(mockVersion), Error, resolver.conflictingInstallErrorMessage + '/');
            mockExecutor.fakeReturnValue = '';
        }
    });

    test('It accepts requests for valid versions and rejects unsupported version requests', async () => {
        if(shouldRun)
        {
            const invalidBandVersion = '7.0.200';
            const invalidMajorVersion = '2.0.0';  // assumption: there will be no 2.0 core version in the feeds ever for any distro
            const expectedOKResult = resolver.ValidateAndInstallSDK(mockVersion);
            assert.exists(expectedOKResult);
            assert.isRejected(resolver.ValidateAndInstallSDK(invalidBandVersion), Error);
            assert.isRejected(resolver.ValidateAndInstallSDK(invalidMajorVersion), Error);
        }
    });

    test('It rejects installs if a custom install exists', async () => {
        if(shouldRun)
        {
            mockDistroProvider.globalPathReturnValue = `/`;
            assert.isRejected(resolver.ValidateAndInstallSDK(mockVersion), Error, resolver.conflictingInstallErrorMessage + '/');
            mockDistroProvider.globalPathReturnValue = null;

            const expectedOKResult = resolver.ValidateAndInstallSDK(mockVersion);
            assert.exists(expectedOKResult);

            mockDistroProvider.globalVersionReturnValue = `5.0.100`; // less than any in distro major or minor
            assert.isRejected(resolver.ValidateAndInstallSDK(mockVersion), Error, resolver.conflictingInstallErrorMessage + '/');
            mockDistroProvider.globalVersionReturnValue = null;
        }
    });

    test('It runs update if it can update instead of installing', async () => {
        if(shouldRun)
        {
            mockDistroProvider.globalPathReturnValue = `/`;
            mockDistroProvider.distroFeedReturnValue = `/`;
            mockDistroProvider.packageExistsReturnValue = true;

            const okResult = await resolver.ValidateAndInstallSDK(mockVersion);
            // assert install command not ran

            mockDistroProvider.globalPathReturnValue = null;
            mockDistroProvider.distroFeedReturnValue = ``;
            mockDistroProvider.packageExistsReturnValue = false;
        }
    });

    test('It does not install if install already exists', async () => {
        if(shouldRun)
        {
        }
    });

});
