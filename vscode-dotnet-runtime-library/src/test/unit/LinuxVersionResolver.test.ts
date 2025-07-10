/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as os from 'os';
import { DistroVersionPair, LinuxVersionResolver } from '../../Acquisition/LinuxVersionResolver';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor, MockDistroProvider } from '../mocks/MockObjects';
import * as util from './TestUtility';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
import { RED_HAT_DISTRO_INFO_KEY, UBUNTU_DISTRO_INFO_KEY } from '../../Acquisition/StringConstants';
const assert = chai.assert;




suite('Linux Version Resolver Tests', function ()
{
    const mockVersion = '7.0.103';
    const acquisitionContext = getMockAcquisitionContext('sdk', mockVersion);
    const mockExecutor = new MockCommandExecutor(acquisitionContext, getMockUtilityContext());
    const pair: DistroVersionPair = { distro: UBUNTU_DISTRO_INFO_KEY, version: '24.04' };
    const redHatPair: DistroVersionPair = { distro: RED_HAT_DISTRO_INFO_KEY, version: '7.3' };
    const shouldRun = os.platform() === 'linux';
    const context = util.getMockAcquisitionContext('sdk', mockVersion);
    const mockRedHatProvider = new MockDistroProvider(redHatPair, context, getMockUtilityContext(), mockExecutor);
    const mockDistroProvider = new MockDistroProvider(pair, context, getMockUtilityContext(), mockExecutor);
    const resolver: LinuxVersionResolver = new LinuxVersionResolver(context, getMockUtilityContext(), mockExecutor, mockDistroProvider);
    const redhatResolver: LinuxVersionResolver = new LinuxVersionResolver(context, getMockUtilityContext(), mockExecutor, mockRedHatProvider);

    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('It can determine the running distro', async () =>
    {
        if (shouldRun)
        {
            const distroVersion = await resolver.getRunningDistro();
            assert.equal(mockExecutor.attemptedCommand, 'cat /etc/os-release');
            assert.exists(distroVersion.distro);
            assert.exists(distroVersion.version);
        }
    });

    test('It falls back to /usr/lib/os-release when /etc/os-release fails', async () =>
    {
        if (shouldRun)
        {
            // Create a new resolver and mock executor for this test to avoid state contamination
            const testContext = util.getMockAcquisitionContext('sdk', mockVersion);
            const testMockExecutor = new MockCommandExecutor(testContext, getMockUtilityContext());
            const testMockDistroProvider = new MockDistroProvider(pair, testContext, getMockUtilityContext(), testMockExecutor);
            const testResolver = new LinuxVersionResolver(testContext, getMockUtilityContext(), testMockExecutor, testMockDistroProvider);

            // Mock /etc/os-release to fail
            testMockExecutor.otherCommandPatternsToMock = ['/etc/os-release', '/usr/lib/os-release'];
            testMockExecutor.otherCommandsReturnValues = [
                { stdout: '', stderr: 'No such file or directory', status: '1' }, // /etc/os-release fails
                { stdout: 'NAME="Ubuntu"\nVERSION_ID="24.04"', stderr: '', status: '0' } // /usr/lib/os-release succeeds
            ];

            const distroVersion = await testResolver.getRunningDistro();
            assert.exists(distroVersion.distro);
            assert.exists(distroVersion.version);
            assert.equal(distroVersion.distro, 'Ubuntu');
            assert.equal(distroVersion.version, '24.04');
        }
    });

    test('It prefers /etc/os-release over /usr/lib/os-release when both exist', async () =>
    {
        if (shouldRun)
        {
            // Create a new resolver and mock executor for this test
            const testContext = util.getMockAcquisitionContext('sdk', mockVersion);
            const testMockExecutor = new MockCommandExecutor(testContext, getMockUtilityContext());
            const testMockDistroProvider = new MockDistroProvider(pair, testContext, getMockUtilityContext(), testMockExecutor);
            const testResolver = new LinuxVersionResolver(testContext, getMockUtilityContext(), testMockExecutor, testMockDistroProvider);

            // Mock both files to succeed with different content
            testMockExecutor.otherCommandPatternsToMock = ['/etc/os-release'];
            testMockExecutor.otherCommandsReturnValues = [
                { stdout: 'NAME="Fedora Linux"\nVERSION_ID="39"', stderr: '', status: '0' } // /etc/os-release succeeds
            ];

            const distroVersion = await testResolver.getRunningDistro();
            assert.exists(distroVersion.distro);
            assert.exists(distroVersion.version);
            assert.equal(distroVersion.distro, 'Fedora Linux');
            assert.equal(distroVersion.version, '39');
            // Should only have tried /etc/os-release
            assert.include(testMockExecutor.attemptedCommand, '/etc/os-release');
            assert.notInclude(testMockExecutor.attemptedCommand, '/usr/lib/os-release');
        }
    });

    test('It throws error when both os-release files fail', async () =>
    {
        if (shouldRun)
        {
            // Create a new resolver and mock executor for this test
            const testContext = util.getMockAcquisitionContext('sdk', mockVersion);
            const testMockExecutor = new MockCommandExecutor(testContext, getMockUtilityContext());
            const testMockDistroProvider = new MockDistroProvider(pair, testContext, getMockUtilityContext(), testMockExecutor);
            const testResolver = new LinuxVersionResolver(testContext, getMockUtilityContext(), testMockExecutor, testMockDistroProvider);

            // Mock both files to fail
            testMockExecutor.otherCommandPatternsToMock = ['/etc/os-release', '/usr/lib/os-release'];
            testMockExecutor.otherCommandsReturnValues = [
                { stdout: '', stderr: 'No such file or directory', status: '1' }, // /etc/os-release fails
                { stdout: '', stderr: 'No such file or directory', status: '1' }  // /usr/lib/os-release fails
            ];

            try
            {
                await testResolver.getRunningDistro();
                assert.fail('Expected an error to be thrown');
            }
            catch (error)
            {
                assert.include(error.message, 'do /etc/os-release or /usr/lib/os-release exist?');
            }
        }
    });

    test('It throws error when os-release files have no NAME or VERSION_ID', async () =>
    {
        if (shouldRun)
        {
            // Create a new resolver and mock executor for this test
            const testContext = util.getMockAcquisitionContext('sdk', mockVersion);
            const testMockExecutor = new MockCommandExecutor(testContext, getMockUtilityContext());
            const testMockDistroProvider = new MockDistroProvider(pair, testContext, getMockUtilityContext(), testMockExecutor);
            const testResolver = new LinuxVersionResolver(testContext, getMockUtilityContext(), testMockExecutor, testMockDistroProvider);

            // Mock /etc/os-release to have invalid content, /usr/lib/os-release to also be invalid
            testMockExecutor.otherCommandPatternsToMock = ['/etc/os-release', '/usr/lib/os-release'];
            testMockExecutor.otherCommandsReturnValues = [
                { stdout: 'SOME_OTHER_KEY="value"', stderr: '', status: '0' }, // /etc/os-release has no NAME/VERSION_ID
                { stdout: 'ANOTHER_KEY="value"', stderr: '', status: '0' }     // /usr/lib/os-release also has no NAME/VERSION_ID
            ];

            try
            {
                await testResolver.getRunningDistro();
                assert.fail('Expected an error to be thrown');
            }
            catch (error)
            {
                assert.include(error.message, 'do /etc/os-release or /usr/lib/os-release exist?');
            }
        }
    });

    test('It rejects distro install if microsoft install exists', async () =>
    {
        if (shouldRun)
        {
            mockDistroProvider.distroFeedReturnValue = `/`;
            // We pass root as the directory where we'd expect a copy of dotnet if it were installed thru the package manager.
            // Root must exist so we should fail. This is not where dotnet would really go.
            assert.isRejected(resolver.ValidateAndInstallSDK(mockVersion), Error, `${resolver.conflictingInstallErrorMessage}/`);
            mockDistroProvider.distroFeedReturnValue = ``;
        }
    });

    test('It rejects microsoft install if distro install exists', async () =>
    {
        if (shouldRun)
        {
            mockDistroProvider.microsoftFeedReturnValue = `/`;
            assert.isRejected(resolver.ValidateAndInstallSDK(mockVersion), Error, `${resolver.conflictingInstallErrorMessage}/`);
            mockDistroProvider.microsoftFeedReturnValue = ``;
        }
    });

    test('It accepts requests for valid versions and rejects unsupported version requests', async () =>
    {
        if (shouldRun)
        {
            const invalidBandVersion = '7.0.200';
            const invalidMajorVersion = '2.0.0';  // assumption: there will be no 2.0 core version in the feeds ever for any distro
            const expectedOKResult = resolver.ValidateAndInstallSDK(mockVersion);
            assert.exists(expectedOKResult);
            assert.isRejected(resolver.ValidateAndInstallSDK(invalidBandVersion), Error);
            assert.isRejected(resolver.ValidateAndInstallSDK(invalidMajorVersion), Error);
        }
    });

    test('It rejects installs if a custom install exists', async () =>
    {
        if (shouldRun)
        {
            mockDistroProvider.globalPathReturnValue = `/`;
            assert.isRejected(resolver.ValidateAndInstallSDK(mockVersion), Error, `${resolver.conflictingInstallErrorMessage}/`);
            mockDistroProvider.globalPathReturnValue = null;

            const expectedOKResult = resolver.ValidateAndInstallSDK(mockVersion);
            assert.exists(expectedOKResult);

            mockDistroProvider.globalVersionReturnValue = `5.0.100`; // less than any in distro major or minor
            assert.isRejected(resolver.ValidateAndInstallSDK(mockVersion), Error, `${resolver.conflictingInstallErrorMessage}/`);
            mockDistroProvider.globalVersionReturnValue = null;
        }
    });

    test('It runs update if it can update instead of installing', async () =>
    {
        if (shouldRun)
        {
            mockDistroProvider.globalPathReturnValue = `/`;
            mockDistroProvider.distroFeedReturnValue = `/`;
            mockDistroProvider.globalVersionReturnValue = '7.0.102';
            mockDistroProvider.packageExistsReturnValue = true;

            const okResult = await resolver.ValidateAndInstallSDK(mockVersion);
            assert.exists(okResult);
            assert.notInclude(mockExecutor.attemptedCommand, 'install');
            assert.include(mockExecutor.attemptedCommand, 'update');

            mockDistroProvider.globalPathReturnValue = null;
            mockDistroProvider.distroFeedReturnValue = ``;
            mockDistroProvider.packageExistsReturnValue = false;
            mockDistroProvider.globalVersionReturnValue = null;
        }
    });

    test('It rejects downloading a lower patch of a major minor', async () =>
    {
        if (shouldRun)
        {
            mockDistroProvider.globalPathReturnValue = `/`;
            mockDistroProvider.distroFeedReturnValue = `/`;
            mockDistroProvider.globalVersionReturnValue = mockVersion;
            mockDistroProvider.packageExistsReturnValue = true;

            assert.isRejected(resolver.ValidateAndInstallSDK(mockVersion), Error);

            mockDistroProvider.globalPathReturnValue = null;
            mockDistroProvider.distroFeedReturnValue = ``;
            mockDistroProvider.packageExistsReturnValue = false;
            mockDistroProvider.globalVersionReturnValue = null;
        }
    });

    test('It does not install if install already exists', async () =>
    {
        if (shouldRun)
        {
            mockDistroProvider.globalPathReturnValue = `/`;
            mockDistroProvider.distroFeedReturnValue = `/`;
            mockDistroProvider.globalVersionReturnValue = mockVersion;

            let okResult = await resolver.ValidateAndInstallSDK(mockVersion);
            assert.exists(okResult);
            assert.notInclude(mockExecutor.attemptedCommand, 'install');

            // Validate the install DOES happen if it needs to

            mockDistroProvider.globalPathReturnValue = ``;
            mockDistroProvider.distroFeedReturnValue = ``;
            mockDistroProvider.globalVersionReturnValue = null;

            okResult = await resolver.ValidateAndInstallSDK(mockVersion);
            assert.exists(okResult);
            assert.include(mockExecutor.attemptedCommand, 'install');
        }
    });

    test('It does not support Red Hat Enterprise Linux 7', async () =>
    {
        if (shouldRun)
        {
            assert.isRejected(resolver.ValidateAndInstallSDK(mockVersion), Error, `${redhatResolver.redhatUnsupportedDistroErrorMessage}/`);
        }
    });
});
