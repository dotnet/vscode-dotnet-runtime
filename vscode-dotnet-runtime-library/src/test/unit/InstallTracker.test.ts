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
const mockContextFromOtherExtension = getMockAcquisitionContext(defaultMode, defaultVersion, defaultTimeoutTime, eventStream);
(mockContextFromOtherExtension.acquisitionContext)!.requestingExtensionId = 'testOther';

suite('InstallTracker Unit Tests', () => {

    test('It Creates a New Record for a New Install', async () => {
        const validator = new MockInstallTracker(mockContext);
        await validator.trackInstallingVersion(defaultInstall);

        const expected : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : ['test']
            } as InstallRecord,
        ]
        assert.deepStrictEqual(await validator.getExistingInstalls(false), expected, 'It created a new record for the install');

    }).timeout(defaultTimeoutTime);

    test('Re-Tracking is a No-Op', async () => {
        const validator = new MockInstallTracker(mockContext);
        await validator.trackInstallingVersion(defaultInstall);
        await validator.trackInstallingVersion(defaultInstall);

        const expected : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : ['test']
            } as InstallRecord,
        ]
        assert.deepStrictEqual(await validator.getExistingInstalls(false), expected, 'It did not create a 2nd record for the same installing install');

        await validator.trackInstalledVersion(defaultInstall);
        await validator.trackInstalledVersion(defaultInstall);

        assert.deepStrictEqual(await validator.getExistingInstalls(true), expected, 'It did not create a 2nd record for the same INSTALLED install');

    }).timeout(defaultTimeoutTime);

    test('It Only Adds the Extension Id to an Existing Install Copy', async () => {
        const validator = new MockInstallTracker(mockContext);
        await validator.trackInstalledVersion(defaultInstall);

        const otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension);
        // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
        otherRequesterValidator.setExtensionState(validator.getExtensionState());
        await otherRequesterValidator.trackInstalledVersion(defaultInstall);

        const expected : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : ['test', 'testOther']
            } as InstallRecord,
        ]

        assert.deepStrictEqual(await otherRequesterValidator.getExistingInstalls(true), expected, 'The second extension validator added its id to the existing install');

    }).timeout(defaultTimeoutTime);

    test('It Works With Different Installs From Multiple or Same Requesters', async () => {
        const validator = new MockInstallTracker(mockContext);
        validator.trackInstalledVersion(defaultInstall);

        const otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension);
        // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
        otherRequesterValidator.setExtensionState(validator.getExtensionState());
        await otherRequesterValidator.trackInstalledVersion(secondInstall);

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

        assert.deepStrictEqual(await otherRequesterValidator.getExistingInstalls(true), expected, 'Multiple installs are tracked separately');

    }).timeout(defaultTimeoutTime);

    test('It Removes the Record if No Other Owners Exist', async () => {
        const validator = new MockInstallTracker(mockContext);
        await validator.trackInstallingVersion(defaultInstall);
        await validator.trackInstalledVersion(defaultInstall);

        await validator.untrackInstallingVersion(defaultInstall);
        assert.deepStrictEqual(await validator.getExistingInstalls(false), [], 'Installing version gets removed with no further owners');
        await validator.untrackInstalledVersion(defaultInstall);
        assert.deepStrictEqual(await validator.getExistingInstalls(true), [], 'Installed version gets removed with no further owners (installing must be ok)');
    }).timeout(defaultTimeoutTime);

    test('It Only Removes the Extension Id if Other Owners Exist', async () => {
        const validator = new MockInstallTracker(mockContext);
        await validator.trackInstalledVersion(defaultInstall);

        const otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension);
        // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
        otherRequesterValidator.setExtensionState(validator.getExtensionState());
        await otherRequesterValidator.trackInstalledVersion(defaultInstall);

        validator.setExtensionState(otherRequesterValidator.getExtensionState());
        await validator.untrackInstalledVersion(defaultInstall);

        const expected : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : ['testOther']
            } as InstallRecord,
        ]

        assert.deepStrictEqual(expected, await otherRequesterValidator.getExistingInstalls(true), 'The second extension validator removed its id from the existing install');

    }).timeout(defaultTimeoutTime);

    test('It Converts Legacy Install Key String to New Type with Null Owner', async () => {
        const validator = new MockInstallTracker(mockContext);

        const extensionStateWithLegacyStrings = new MockExtensionContext();
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

        assert.deepStrictEqual(await validator.getExistingInstalls(true), expected, 'It converted the legacy strings to the new type');

    }).timeout(defaultTimeoutTime);

    test('It Handles Null Owner Gracefully on Duplicate Install and Removal', async () => {
        const validator = new MockInstallTracker(mockContext);

        const extensionStateWithLegacyStrings = new MockExtensionContext();
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

        await validator.trackInstalledVersion(defaultInstall);

        assert.deepStrictEqual(expected, await validator.getExistingInstalls(true), 'It added the new owner to the existing null install');

        await validator.untrackInstalledVersion(defaultInstall);
        await validator.untrackInstalledVersion(secondInstall);

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

        assert.deepStrictEqual(await validator.getExistingInstalls(true), expectedTwo, 'It removed the owner from the existing null install');
    }).timeout(defaultTimeoutTime);


    test('It Can Reclassify an Install from Installing to Installed', async () => {
        const validator = new MockInstallTracker(mockContext);
        await validator.trackInstallingVersion(defaultInstall);

        const otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension);
        // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
        otherRequesterValidator.setExtensionState(validator.getExtensionState());
        await otherRequesterValidator.trackInstallingVersion(defaultInstall);
        await otherRequesterValidator.trackInstallingVersion(secondInstall);
        await otherRequesterValidator.reclassifyInstallingVersionToInstalled(secondInstall);

        let expectedInstalling : InstallRecord[] = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : ['test', 'testOther']
            } as InstallRecord,
        ]

        let expectedInstalled : InstallRecord[] = [
            {
                dotnetInstall : secondInstall,
                installingExtensions : ['testOther']
            } as InstallRecord,
        ]

        assert.deepStrictEqual(await otherRequesterValidator.getExistingInstalls(true), expectedInstalled, 'The installing version was moved from installing to installed');
        assert.deepStrictEqual(await otherRequesterValidator.getExistingInstalls(false), expectedInstalling, 'The installing version was not erroneously moved');

        await otherRequesterValidator.reclassifyInstallingVersionToInstalled(defaultInstall);

        expectedInstalled = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : ['test', 'testOther']
            } as InstallRecord,
            {
                dotnetInstall : secondInstall,
                installingExtensions : ['testOther']
            } as InstallRecord,
        ]


        assert.deepStrictEqual(await otherRequesterValidator.getExistingInstalls(true), expectedInstalled, `The installing version with multiple owners
was moved from installing to installed`);

        // There is a condition where multiple extensions can be 'installing' the same thing.
        // Luckily due to the nature of the installs, this should not cause issues with the install.

        expectedInstalling = [
            {
                dotnetInstall : defaultInstall,
                installingExtensions : ['test']
            } as InstallRecord,
        ]

        // This is a rare case, but it can happen. In this case, the reclassification should not move the install to installed for the extensions still in the process of installing.
        // The design could go either way and migrate them all at once, but there is logic that relies on the installing state to be updated on a per extension basis.
        // So this is the safer option.
        assert.deepStrictEqual(await otherRequesterValidator.getExistingInstalls(false), expectedInstalling, 'The installing version from another extension does NOT get moved');

    }).timeout(defaultTimeoutTime);
});
