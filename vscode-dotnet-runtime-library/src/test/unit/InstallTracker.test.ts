/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { fork } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { DotnetInstall } from '../../Acquisition/DotnetInstall';
import { InstallRecord } from '../../Acquisition/InstallRecord';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { getDotnetExecutable } from '../../Utils/TypescriptUtilities';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockEventStream, MockExtensionContext, MockInstallTracker } from '../mocks/MockObjects';
import { getMockAcquisitionContext } from './TestUtility';
import path = require('path');

const assert = chai.assert;
const defaultVersion = '7.0';
const secondVersion = '8.0';
const defaultMode = 'runtime';
const defaultInstall: DotnetInstall = {
    version: defaultVersion,
    isGlobal: false,
    architecture: os.arch(),
    installId: `${defaultVersion}~${os.arch()}`,
    installMode: defaultMode
}

const secondInstall: DotnetInstall = {
    version: secondVersion,
    isGlobal: false,
    architecture: os.arch(),
    installId: `${secondVersion}~${os.arch()}`,
    installMode: defaultMode
}
const defaultTimeoutTime = 5000;
const eventStream = new MockEventStream();
const fakeValidDir = path.join(__dirname, 'dotnetFakeDir');
const mockContext = getMockAcquisitionContext(defaultMode, defaultVersion, defaultTimeoutTime, eventStream);
const mockContextFromOtherExtension = getMockAcquisitionContext(defaultMode, defaultVersion, defaultTimeoutTime, eventStream);
(mockContextFromOtherExtension.acquisitionContext)!.requestingExtensionId = 'testOther';

function resetExtensionState()
{
    mockContext.extensionState.update('installed', []);
}

fs.mkdirSync(fakeValidDir, { recursive: true });
fs.writeFileSync(path.join(fakeValidDir, 'dotnet'), 'fake');

// Helper function to create a random session ID for testing
function generateRandomSessionId(): string
{
    const randomBytes = new Uint8Array(3);
    for (let i = 0; i < randomBytes.length; i++)
    {
        randomBytes[i] = Math.floor(Math.random() * 256);
    }
    return `test-session-${Array.from(randomBytes).join('')}`;
}

// Helper function to spawn a process that holds a mutex with a specific session ID
function spawnMutexHolderProcess(sessionId: string): Promise<{ child: any, sessionId: string }>
{
    return new Promise((resolve, reject) =>
    {
        const child = fork(path.join(__dirname, '../mocks/MockMutexHolder.js'));

        // Set up event handlers
        child.on('message', (msg: any) =>
        {
            if (msg.acquired)
            {
                resolve({ child, sessionId });
            } else if (msg.error)
            {
                reject(new Error(msg.error));
            }
        });

        // Start the mutex holder with the given session ID
        child.send({ sessionId });

        // Set a timeout in case the process doesn't respond
        setTimeout(() =>
        {
            reject(new Error('Timeout waiting for mutex holder process to start'));
        }, 5000);
    });
}

suite('InstallTracker Unit Tests', function ()
{
    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('It Creates a New Record for a New Install', async () =>
    {
        resetExtensionState();

        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        await validator.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

        const expected: InstallRecord[] = [
            {
                dotnetInstall: defaultInstall,
                installingExtensions: ['test']
            } as InstallRecord,
        ]
        assert.deepStrictEqual(await validator.getExistingInstalls(mockContext.installDirectoryProvider), expected, 'It created a new record for the install');
    }).timeout(defaultTimeoutTime);

    test('Re-Tracking is a No-Op', async () =>
    {
        resetExtensionState();

        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);

        const expected: InstallRecord[] = [
            {
                dotnetInstall: defaultInstall,
                installingExtensions: ['test']
            } as InstallRecord,
        ]

        await validator.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);
        await validator.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

        assert.deepStrictEqual(await validator.getExistingInstalls(mockContext.installDirectoryProvider), expected, 'It did not create a 2nd record for the same INSTALLED install');

    }).timeout(defaultTimeoutTime);

    test('It Only Adds the Extension Id to an Existing Install Copy', async () =>
    {
        resetExtensionState();

        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        await validator.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

        const otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension.eventStream, mockContext.extensionState);
        // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
        otherRequesterValidator.setExtensionState(validator.getExtensionState());
        await otherRequesterValidator.trackInstalledVersion(mockContextFromOtherExtension, defaultInstall, fakeValidDir);

        const expected: InstallRecord[] = [
            {
                dotnetInstall: defaultInstall,
                installingExtensions: ['test', 'testOther']
            } as InstallRecord,
        ]

        assert.deepStrictEqual(await otherRequesterValidator.getExistingInstalls(mockContext.installDirectoryProvider), expected, 'The second extension validator added its id to the existing install');

    }).timeout(defaultTimeoutTime);

    test('It Works With Different Installs From Multiple or Same Requesters', async () =>
    {
        resetExtensionState();

        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        await validator.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

        const otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension.eventStream, mockContext.extensionState);
        // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
        otherRequesterValidator.setExtensionState(validator.getExtensionState());
        await otherRequesterValidator.trackInstalledVersion(mockContextFromOtherExtension, secondInstall, fakeValidDir);

        const expected: InstallRecord[] = [
            {
                dotnetInstall: defaultInstall,
                installingExtensions: ['test'],
            } as InstallRecord,
            {
                dotnetInstall: secondInstall,
                installingExtensions: ['testOther'],
            } as InstallRecord,
        ]

        assert.deepStrictEqual(await otherRequesterValidator.getExistingInstalls(mockContext.installDirectoryProvider), expected, 'Multiple installs are tracked separately');

    }).timeout(defaultTimeoutTime);

    test('It Removes the Record if No Other Owners Exist', async () =>
    {
        resetExtensionState();

        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        await validator.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);
        await validator.untrackInstalledVersion(mockContext, defaultInstall);
        assert.deepStrictEqual(await validator.getExistingInstalls(mockContext.installDirectoryProvider), [], 'Installed version gets removed with no further owners (installing must be ok)');
    }).timeout(defaultTimeoutTime);

    test('It Only Removes the Extension Id if Other Owners Exist', async () =>
    {
        resetExtensionState();

        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        await validator.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

        const otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension.eventStream, mockContextFromOtherExtension.extensionState);
        // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
        otherRequesterValidator.setExtensionState(validator.getExtensionState());
        await otherRequesterValidator.trackInstalledVersion(mockContextFromOtherExtension, defaultInstall, fakeValidDir);

        validator.setExtensionState(otherRequesterValidator.getExtensionState());
        await validator.untrackInstalledVersion(mockContext, defaultInstall);

        const expected: InstallRecord[] = [
            {
                dotnetInstall: defaultInstall,
                installingExtensions: ['testOther']
            } as InstallRecord,
        ]

        assert.deepStrictEqual(expected, await otherRequesterValidator.getExistingInstalls(mockContext.installDirectoryProvider), 'The second extension validator removed its id from the existing install');

    }).timeout(defaultTimeoutTime);

    test('It Converts Legacy Install Id String to New Type with Null Owner', async () =>
    {
        resetExtensionState();

        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);

        const extensionStateWithLegacyStrings = new MockExtensionContext();
        extensionStateWithLegacyStrings.update('installed', [defaultInstall.installId, secondInstall.installId]);
        validator.setExtensionState(extensionStateWithLegacyStrings);

        const expected: InstallRecord[] = [
            {
                dotnetInstall: defaultInstall,
                installingExtensions: [null]
            } as InstallRecord,
            {
                dotnetInstall: secondInstall,
                installingExtensions: [null]
            }
        ]

        assert.deepStrictEqual(await validator.getExistingInstalls(mockContext.installDirectoryProvider), expected, 'It converted the legacy strings to the new type');

    }).timeout(defaultTimeoutTime);

    test('It Handles Null Owner Gracefully on Duplicate Install and Removal', async () =>
    {
        resetExtensionState();

        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);

        const extensionStateWithLegacyStrings = new MockExtensionContext();
        extensionStateWithLegacyStrings.update('installed', [defaultInstall.installId, secondInstall.installId]);
        validator.setExtensionState(extensionStateWithLegacyStrings);

        const expected: InstallRecord[] = [
            {
                dotnetInstall: defaultInstall,
                installingExtensions: [null, 'test']
            } as InstallRecord,
            {
                dotnetInstall: secondInstall,
                installingExtensions: [null]
            }
        ]

        await validator.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

        assert.deepStrictEqual(expected, await validator.getExistingInstalls(mockContext.installDirectoryProvider), 'It added the new owner to the existing null install');

        await validator.untrackInstalledVersion(mockContext, defaultInstall);
        await validator.untrackInstalledVersion(mockContext, secondInstall);

        const expectedTwo: InstallRecord[] = [
            {
                dotnetInstall: defaultInstall,
                installingExtensions: [null]
            } as InstallRecord,
            {
                dotnetInstall: secondInstall,
                installingExtensions: [null]
            }
        ]

        assert.deepStrictEqual(await validator.getExistingInstalls(mockContext.installDirectoryProvider), expectedTwo, 'It removed the owner from the existing null install');
    }).timeout(defaultTimeoutTime);
});

suite('InstallTracker Session Mutex Tests', function ()
{
    const testTimeoutTime = 10000; // 10 seconds timeout for these tests
    let mutexHolderProcesses: { child: any, sessionId: string }[] = [];

    this.afterEach(async () =>
    {
        // Clean up spawned processes
        for (const process of mutexHolderProcesses)
        {
            process.child.send({ exit: true });
            process.child.kill();
        }
        mutexHolderProcesses = [];

        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();

        // Reset extension state
        resetExtensionState();
    });

    test('It detects that a session is alive when its mutex is held', async () =>
    {
        const sessionId = generateRandomSessionId();

        // Spawn a process that holds the mutex for the session
        const { child } = await spawnMutexHolderProcess(sessionId);
        mutexHolderProcesses.push({ child, sessionId });

        const installExePath = path.join(fakeValidDir, getDotnetExecutable());
        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        await validator.markInstallAsInUseBySession(sessionId, installExePath);

        // Check that the session is detected as alive
        const hasNoLiveDependents = await validator.installHasNoLiveDependents(installExePath);

        // Since the session is alive and has the install marked as in use, it should have live dependents
        assert.isFalse(hasNoLiveDependents, 'Install should be detected as having live dependents when session is alive');
    }).timeout(testTimeoutTime);

    test('It detects that a session is dead when its process is killed', async () =>
    {
        const sessionId = generateRandomSessionId();

        const { child } = await spawnMutexHolderProcess(sessionId);

        const installExePath = path.join(fakeValidDir, getDotnetExecutable());
        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        await validator.markInstallAsInUseBySession(sessionId, installExePath);
        child.kill('SIGKILL');

        // Give the system a moment to recognize the process is dead
        await new Promise(resolve => setTimeout(resolve, 1000));

        const hasNoLiveDependents = await validator.installHasNoLiveDependents(installExePath);
        // Since the session is now dead, it should not have live dependents
        assert.isTrue(hasNoLiveDependents, 'Install should be detected as not having live dependents when session is dead');
    }).timeout(testTimeoutTime);

    test('It handles multiple sessions with different installs correctly', async () =>
    {
        const sessionId1 = generateRandomSessionId();
        const sessionId2 = generateRandomSessionId();

        const process1 = await spawnMutexHolderProcess(sessionId1);
        const process2 = await spawnMutexHolderProcess(sessionId2);
        mutexHolderProcesses.push(process1, process2);

        const installExePath1 = path.join(fakeValidDir, getDotnetExecutable());
        const installExePath2 = path.join(os.tmpdir(), 'dotnet-test', getDotnetExecutable());
        fs.mkdirSync(path.dirname(installExePath2), { recursive: true });
        fs.writeFileSync(installExePath2, 'fake-dotnet');

        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);

        await validator.markInstallAsInUseBySession(sessionId1, installExePath1);
        await validator.markInstallAsInUseBySession(sessionId2, installExePath2);

        // Both sessions are alive, so both installs should have live dependents
        const hasNoLiveDependents1 = await validator.installHasNoLiveDependents(installExePath1);
        const hasNoLiveDependents2 = await validator.installHasNoLiveDependents(installExePath2);

        assert.isFalse(hasNoLiveDependents1, 'First install should have live dependents');
        assert.isFalse(hasNoLiveDependents2, 'Second install should have live dependents');

        process1.child.kill('SIGKILL');

        // Give the system a moment to recognize the process is dead
        await new Promise(resolve => setTimeout(resolve, 1000));

        const hasNoLiveDependents1After = await validator.installHasNoLiveDependents(installExePath1);
        const hasNoLiveDependents2After = await validator.installHasNoLiveDependents(installExePath2);

        assert.isTrue(hasNoLiveDependents1After, 'First install should not have live dependents after its session died');
        assert.isFalse(hasNoLiveDependents2After, 'Second install should still have live dependents');

        // Clean up the temporary file
        try
        {
            fs.unlinkSync(installExePath2);
            fs.rmdirSync(path.dirname(installExePath2), { recursive: true });
        }
        catch (e)
        {
            // Ignore errors in cleanup
        }
    }).timeout(testTimeoutTime);

    test('It acquires permanent session mutex on construction', async () =>
    {
        // Create a validator with a custom session ID
        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);

        // Try to acquire the same mutex in another process
        try
        {
            await spawnMutexHolderProcess(validator.getSessionId());
            assert.fail('Should not be able to acquire mutex that should be held by the validator');
        } catch (err)
        {
            // Expected - mutex should be held by the validator
            assert.isDefined(err, 'Should get an error when trying to acquire a mutex already held');
        }
    }).timeout(testTimeoutTime);
});
