/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { InstallationValidator } from '../../Acquisition/InstallationValidator';
import { MockEventStream, MockExtensionContext, MockInstallTracker } from '../mocks/MockObjects';
import * as os from 'os';
import { DotnetInstall, GetDotnetInstallInfo } from '../../Acquisition/DotnetInstall';
import { getMockAcquisitionContext } from './TestUtility';
import { getInstallKeyFromContext } from '../../Utils/InstallKeyUtilities';
import { InstallRecord } from '../../Acquisition/InstallRecord';

const assert = chai.assert;
const defaultVersion = '7.0';
const secondVersion = '8.0';
const defaultMode = 'runtime';
const defaultInstall : DotnetInstall = {
    version: defaultVersion,
    isGlobal: false,
    architecture: os.arch(),
    installKey: `${defaultVersion}~${os.arch()}`,
    installMode: defaultMode
}

const secondInstall : DotnetInstall = {
    version: secondVersion,
    isGlobal: false,
    architecture: os.arch(),
    installKey: `${secondVersion}~${os.arch()}`,
    installMode: defaultMode
}
const defaultTimeoutTime = 5000;
const eventStream = new MockEventStream();

const mockContext = getMockAcquisitionContext(defaultMode, defaultVersion, defaultTimeoutTime, eventStream);
let mockContextFromOtherExtension = getMockAcquisitionContext(defaultMode, defaultVersion, defaultTimeoutTime, eventStream);
(mockContextFromOtherExtension.acquisitionContext)!.requestingExtensionId = 'testOther';

suite('InstallTracker Unit Tests', () => {

    test('It Creates a New Record for a New Install', async () => {
        const validator = new MockInstallTracker(mockContext);
        validator.trackInstallingVersion(defaultInstall);

        const expected : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : ['test']
            } as InstallRecord,
        ]
        assert.deepStrictEqual(expected, await validator.getExistingInstalls(false))

    }).timeout(defaultTimeoutTime);

    test('It Only Adds the Extension Id to an Existing Install Copy', async () => {
        const validator = new MockInstallTracker(mockContext);
        validator.trackInstalledVersion(defaultInstall);

        let otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension);
        // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
        otherRequesterValidator.setExtensionState(validator.getExtensionState());
        otherRequesterValidator.trackInstalledVersion(defaultInstall);

        const expected : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : ['test', 'testOther']
            } as InstallRecord,
        ]

        assert.deepStrictEqual(expected, await otherRequesterValidator.getExistingInstalls(false), 'The second extension validator found the result');

    }).timeout(defaultTimeoutTime);

    test('It Works With Different Installs From Multiple or Same Requesters', async () => {
        const validator = new MockInstallTracker(mockContext);
        validator.trackInstalledVersion(defaultInstall);

        let otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension);
        // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
        otherRequesterValidator.setExtensionState(validator.getExtensionState());
        otherRequesterValidator.trackInstalledVersion(secondInstall);

        const expected : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : ['test'],
            } as InstallRecord,
            {
                dotnetInstall : secondInstall,
                installingExtensions : ['testOther'],
            } as InstallRecord,
        ]

        assert.deepStrictEqual(expected, await otherRequesterValidator.getExistingInstalls(false), 'The second extension validator found the result');

    }).timeout(defaultTimeoutTime);

    test('It Removes the Record if No Other Owners Exist', async () => {
        const validator = new MockInstallTracker(mockContext);
        validator.trackInstallingVersion(defaultInstall);
        validator.trackInstalledVersion(defaultInstall);

        validator.untrackInstallingVersion(defaultInstall);
        assert.deepStrictEqual([], await validator.getExistingInstalls(false));
        validator.untrackInstalledVersion(defaultInstall);
        assert.deepStrictEqual([], await validator.getExistingInstalls(true));
    }).timeout(defaultTimeoutTime);

    test('It Only Removes the Extension Id if Other Owners Exist', async () => {
        const validator = new MockInstallTracker(mockContext);
        validator.trackInstalledVersion(defaultInstall);

        let otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension);
        // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
        otherRequesterValidator.setExtensionState(validator.getExtensionState());
        otherRequesterValidator.trackInstalledVersion(defaultInstall);

        validator.setExtensionState(otherRequesterValidator.getExtensionState());
        validator.untrackInstalledVersion(defaultInstall);

        const expected : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : ['testOther']
            } as InstallRecord,
        ]

        assert.deepStrictEqual(expected, await otherRequesterValidator.getExistingInstalls(false));

    }).timeout(defaultTimeoutTime);

    test('It Converts Legacy Install Key String to New Type with Null Owner', async () => {
        const validator = new MockInstallTracker(mockContext);

        let extensionStateWithLegacyStrings = new MockExtensionContext();
        extensionStateWithLegacyStrings.update('installed', [defaultInstall.installKey, secondInstall.installKey]);
        validator.setExtensionState(extensionStateWithLegacyStrings);

        const expected : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : [null]
            } as InstallRecord,
            {
                dotnetInstall: secondInstall,
                installingExtensions : [null]
            }
        ]

        assert.deepStrictEqual(expected, await validator.getExistingInstalls(false));

    }).timeout(defaultTimeoutTime);

    test('It Handles Null Owner Gracefully on Duplicate Install and Removal', async () => {
        const validator = new MockInstallTracker(mockContext);

        let extensionStateWithLegacyStrings = new MockExtensionContext();
        extensionStateWithLegacyStrings.update('installed', [defaultInstall.installKey, secondInstall.installKey]);
        validator.setExtensionState(extensionStateWithLegacyStrings);

        const expected : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : [null, 'test']
            } as InstallRecord,
            {
                dotnetInstall: secondInstall,
                installingExtensions : [null]
            }
        ]

        validator.trackInstalledVersion(defaultInstall);

        assert.deepStrictEqual(expected, await validator.getExistingInstalls(false));

        validator.untrackInstalledVersion(defaultInstall);
        validator.untrackInstalledVersion(secondInstall);

        const expectedTwo : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : [null]
            } as InstallRecord,
            {
                dotnetInstall: secondInstall,
                installingExtensions : [null]
            }
        ]

        assert.deepStrictEqual(expectedTwo, await validator.getExistingInstalls(false));
    }).timeout(defaultTimeoutTime);

});
