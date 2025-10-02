/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { ChildProcess, fork } from 'child_process';
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
function spawnMutexHolderProcess(sessionId?: string): Promise<{ child: ChildProcess, sessionId: string }>
{
    const actualSessionId = sessionId || generateRandomSessionId();

    // Remove 'dist' from the path so the js file is used.
    const scriptPath = path.resolve(__dirname, '../../../src/test/mocks/MockMutexHolder.js');

    // Verify the script exists
    if (!fs.existsSync(scriptPath))
    {
        return Promise.reject(new Error(`Mock mutex holder script not found at ${scriptPath}`));
    }

    console.log(`Starting mutex holder process for session ${actualSessionId} with script at ${scriptPath}`);

    return new Promise((resolve, reject) =>
    {
        // Set up handlers for stdout and stderr to debug issues
        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        // Use fork to start the mutex holder process
        const child = fork(scriptPath, [], {
            stdio: ['pipe', 'pipe', 'pipe', 'ipc']
        });

        if (child.stdout)
        {
            child.stdout.on('data', (chunk) =>
            {
                stdoutChunks.push(Buffer.from(chunk));
                console.log(`[Mutex ${actualSessionId}] ${chunk.toString().trim()}`);
            });
        }

        if (child.stderr)
        {
            child.stderr.on('data', (chunk) =>
            {
                stderrChunks.push(Buffer.from(chunk));
                console.error(`[Mutex ${actualSessionId}] ERROR: ${chunk.toString().trim()}`);
            });
        }

        // Track if we've resolved or rejected already
        let settled = false;

        // Set up error handler
        child.on('error', (err) =>
        {
            const stdout = Buffer.concat(stdoutChunks).toString();
            const stderr = Buffer.concat(stderrChunks).toString();

            console.error(`Error in mutex holder process for session ${actualSessionId}:`, err);
            console.error(`Process stdout: ${stdout}`);
            console.error(`Process stderr: ${stderr}`);

            if (!settled)
            {
                settled = true;
                reject(new Error(`Failed to spawn mutex holder process: ${err.message}`));
            }
        });

        // Handle process exit
        child.on('exit', (code, signal) =>
        {
            console.log(`Mutex holder process for session ${actualSessionId} exited with code ${code}, signal ${signal}`);
            if (!settled)
            {
                settled = true;

                const stdout = Buffer.concat(stdoutChunks).toString();
                const stderr = Buffer.concat(stderrChunks).toString();

                console.error(`Process stdout: ${stdout}`);
                console.error(`Process stderr: ${stderr}`);

                reject(new Error(`Mutex holder process exited unexpectedly with code ${code} and signal ${signal}`));
            }
        });

        // Set up message handler
        child.on('message', (msg: any) =>
        {
            if (msg.acquired)
            {
                console.log(`Mutex holder process acquired mutex for session ${actualSessionId}`);
                if (!settled)
                {
                    settled = true;
                    resolve({ child, sessionId: actualSessionId });
                }
            } else if (msg.error)
            {
                console.error(`Mutex holder process failed to acquire mutex for session ${actualSessionId}:`, msg.error);
                if (!settled)
                {
                    settled = true;
                    reject(new Error(msg.error));
                }
            }
        });

        // Start the mutex holder with the given session ID
        child.send({ sessionId: actualSessionId });

        // Set a timeout in case the process doesn't respond
        setTimeout(() =>
        {
            if (!settled)
            {
                settled = true;
                console.error(`Timeout waiting for mutex holder process to start for session ${actualSessionId}`);

                const stdout = Buffer.concat(stdoutChunks).toString();
                const stderr = Buffer.concat(stderrChunks).toString();

                console.error(`Process stdout: ${stdout}`);
                console.error(`Process stderr: ${stderr}`);

                // Try to kill the process before rejecting
                try
                {
                    if (!child.killed)
                    {
                        child.kill('SIGKILL');
                    }
                } catch (e)
                {
                    console.error(`Failed to kill mutex holder process: ${e}`);
                }

                reject(new Error(`Timeout waiting for mutex holder process to start for session ${actualSessionId}`));
            }
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
        const trackerSingletonMockAccess = new MockInstallTracker(new MockEventStream(), new MockExtensionContext());
        trackerSingletonMockAccess.endAnySingletonTrackingSessions();
    });

    test('It Creates a New Record for a New Install', async () =>
    {
        resetExtensionState();
        const tracker = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);

        try
        {
            await tracker.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

            const expected: InstallRecord[] = [
                {
                    dotnetInstall: defaultInstall,
                    installingExtensions: ['test']
                } as InstallRecord,
            ]
            assert.deepStrictEqual(await tracker.getExistingInstalls(mockContext.installDirectoryProvider), expected, 'It created a new record for the install');
        }
        finally
        {
        }
    }).timeout(defaultTimeoutTime);

    test('Re-Tracking is a No-Op', async () =>
    {
        resetExtensionState();

        const tracker = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);

        try
        {
            const expected: InstallRecord[] = [
                {
                    dotnetInstall: defaultInstall,
                    installingExtensions: ['test']
                } as InstallRecord,
            ]

            await tracker.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);
            await tracker.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

            assert.deepStrictEqual(await tracker.getExistingInstalls(mockContext.installDirectoryProvider), expected, 'It did not create a 2nd record for the same INSTALLED install');
        }
        finally
        {
        }
    }).timeout(defaultTimeoutTime);

    test('It Only Adds the Extension Id to an Existing Install Copy', async () =>
    {
        resetExtensionState();

        const tracker = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        try
        {
            await tracker.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

            const otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension.eventStream, mockContext.extensionState);
            // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
            otherRequesterValidator.setExtensionState(tracker.getExtensionState());
            await otherRequesterValidator.trackInstalledVersion(mockContextFromOtherExtension, defaultInstall, fakeValidDir);

            const expected: InstallRecord[] = [
                {
                    dotnetInstall: defaultInstall,
                    installingExtensions: ['test', 'testOther']
                } as InstallRecord,
            ]

            assert.deepStrictEqual(await otherRequesterValidator.getExistingInstalls(mockContext.installDirectoryProvider), expected, 'The second extension validator added its id to the existing install');
        }
        finally
        {
        }
    }).timeout(defaultTimeoutTime);

    test('It Works With Different Installs From Multiple or Same Requesters', async () =>
    {
        resetExtensionState();

        const tracker = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        try
        {
            await tracker.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

            const otherRequesterValidator = new MockInstallTracker(mockContextFromOtherExtension.eventStream, mockContext.extensionState);
            // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
            otherRequesterValidator.setExtensionState(tracker.getExtensionState());
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
        }
        finally
        {
        }
    }).timeout(defaultTimeoutTime);

    test('It Removes the Record if No Other Owners Exist', async () =>
    {
        resetExtensionState();

        const tracker = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        try
        {
            await tracker.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);
            await tracker.untrackInstalledVersion(mockContext, defaultInstall);
            assert.deepStrictEqual(await tracker.getExistingInstalls(mockContext.installDirectoryProvider), [], 'Installed version gets removed with no further owners (installing must be ok)');
        }
        finally
        {
        }
    }).timeout(defaultTimeoutTime);

    test('It Only Removes the Extension Id if Other Owners Exist', async () =>
    {
        resetExtensionState();

        const tracker = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        const otherRequesterTracker = new MockInstallTracker(mockContextFromOtherExtension.eventStream, mockContextFromOtherExtension.extensionState);
        try
        {
            await tracker.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

            // Inject the extension state from the old class into the new one, because in vscode its a shared global state but here its mocked
            otherRequesterTracker.setExtensionState(tracker.getExtensionState());
            await otherRequesterTracker.trackInstalledVersion(mockContextFromOtherExtension, defaultInstall, fakeValidDir);

            tracker.setExtensionState(otherRequesterTracker.getExtensionState());
            await tracker.untrackInstalledVersion(mockContext, defaultInstall);

            const expected: InstallRecord[] = [
                {
                    dotnetInstall: defaultInstall,
                    installingExtensions: ['testOther']
                } as InstallRecord,
            ]

            assert.deepStrictEqual(expected, await otherRequesterTracker.getExistingInstalls(mockContext.installDirectoryProvider), 'The second extension validator removed its id from the existing install');
        }
        finally
        {
            tracker.endAnySingletonTrackingSessions();
            otherRequesterTracker.endAnySingletonTrackingSessions();
        }
    }).timeout(defaultTimeoutTime);

    test('It Converts Legacy Install Id String to New Type with Null Owner', async () =>
    {
        resetExtensionState();

        const tracker = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        try
        {
            const extensionStateWithLegacyStrings = new MockExtensionContext();
            extensionStateWithLegacyStrings.update('installed', [defaultInstall.installId, secondInstall.installId]);
            tracker.setExtensionState(extensionStateWithLegacyStrings);

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

            assert.deepStrictEqual(await tracker.getExistingInstalls(mockContext.installDirectoryProvider), expected, 'It converted the legacy strings to the new type');
        }
        finally
        {
        }
    }).timeout(defaultTimeoutTime);

    test('It Handles Null Owner Gracefully on Duplicate Install and Removal', async () =>
    {
        resetExtensionState();

        const tracker = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        try
        {
            const extensionStateWithLegacyStrings = new MockExtensionContext();
            extensionStateWithLegacyStrings.update('installed', [defaultInstall.installId, secondInstall.installId]);
            tracker.setExtensionState(extensionStateWithLegacyStrings);

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

            await tracker.trackInstalledVersion(mockContext, defaultInstall, fakeValidDir);

            assert.deepStrictEqual(expected, await tracker.getExistingInstalls(mockContext.installDirectoryProvider), 'It added the new owner to the existing null install');

            await tracker.untrackInstalledVersion(mockContext, defaultInstall);
            await tracker.untrackInstalledVersion(mockContext, secondInstall);

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

            assert.deepStrictEqual(await tracker.getExistingInstalls(mockContext.installDirectoryProvider), expectedTwo, 'It removed the owner from the existing null install');
        }
        finally
        {
        }
    }).timeout(defaultTimeoutTime);
});

suite('InstallTracker Session Mutex Tests', function ()
{
    const testTimeoutTime = 30000; // 30 seconds timeout for these tests

    // Helper function to clean up mutex holder processes
    async function cleanupMutexHolders(processes: { child: ChildProcess, sessionId: string }[]): Promise<void>
    {
        for (const process of processes)
        {
            try
            {
                if (!process.child.killed && process.child.pid)
                {
                    console.log(`Cleaning up mutex holder process with PID: ${process.child.pid} for session ${process.sessionId}`);
                    // Try to send exit command first for graceful shutdown
                    if (process.child.connected)
                    {
                        try
                        {
                            process.child.send({ command: 'exit' });
                            // Give it a little time to clean up
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                        catch (err)
                        {
                            console.log(`Failed to send exit command: ${err}`);
                        }
                    }

                    // Force kill if still running
                    if (!process.child.killed)
                    {
                        process.child.kill('SIGTERM');
                    }
                }
            }
            catch (err)
            {
                console.error(`Error killing mutex holder process: ${err}`);
            }
        }
    }

    // Clean up any orphaned mutex socket files before tests
    this.beforeAll(function ()
    {
        const cleanupSockets = () =>
        {
            try
            {
                const ipcPathDir = os.platform() === 'linux' && process.env.XDG_RUNTIME_DIR ?
                    process.env.XDG_RUNTIME_DIR : os.tmpdir();

                if (os.platform() !== 'win32' && fs.existsSync(ipcPathDir))
                {
                    const files = fs.readdirSync(ipcPathDir);
                    files.forEach(file =>
                    {
                        if (file.startsWith('vscd-test-session-') && file.endsWith('.sock'))
                        {
                            const fullPath = path.join(ipcPathDir, file);
                            try
                            {
                                console.log(`Cleaning up orphaned socket file: ${fullPath}`);
                                fs.unlinkSync(fullPath);
                            } catch (e)
                            {
                                console.error(`Failed to clean up socket file ${fullPath}: ${e}`);
                            }
                        }
                    });
                }
            } catch (err)
            {
                console.error(`Error during socket cleanup: ${err}`);
            }
        };

        cleanupSockets();
    });

    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();

        // Reset extension state
        resetExtensionState();

        const trackerSingletonMockAccess = new MockInstallTracker(new MockEventStream(), new MockExtensionContext());
        trackerSingletonMockAccess.endAnySingletonTrackingSessions();
    });

    test('It detects that a session is alive when its mutex is held', async () =>
    {
        const processes: { child: ChildProcess, sessionId: string }[] = [];
        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        const sessionId = validator.getSessionId();

        try
        {
            const installExePath = path.join(fakeValidDir, getDotnetExecutable());
            await validator.markInstallAsInUseBySession(sessionId, installExePath);

            const hasNoLiveDependents = await validator.installHasNoLiveDependents(installExePath);
            // Since the session is alive and has the install marked as in use, it should have live dependents
            assert.isFalse(hasNoLiveDependents, 'Install should be detected as having live dependents when session is alive');
        }
        finally
        {
            await cleanupMutexHolders(processes);
        }
    }).timeout(testTimeoutTime);

    test('It detects that a session is dead when its process is killed', async () =>
    {
        const processes: { child: ChildProcess, sessionId: string }[] = [];
        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        const sessionId = validator.getSessionId();

        try
        {
            const { child } = await spawnMutexHolderProcess(sessionId);
            processes.push({ child, sessionId });

            const installExePath = path.join(fakeValidDir, getDotnetExecutable());

            await validator.markInstallAsInUseBySession(sessionId, installExePath);
            await validator.endAnySingletonTrackingSessions();

            const hasNoLiveDependents = await validator.installHasNoLiveDependents(installExePath);
            assert.isTrue(hasNoLiveDependents, 'Install should be detected as not having live dependents when session is dead');
        }
        finally
        {
            await cleanupMutexHolders(processes);
        }
    }).timeout(testTimeoutTime);

    test('It handles multiple sessions with different installs correctly', async () =>
    {
        const sessionId1 = generateRandomSessionId();
        const sessionId2 = generateRandomSessionId();
        const processes: { child: ChildProcess, sessionId: string }[] = [];
        let tempFile: string | undefined;
        const validator = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);

        try
        {
            const { child: child1 } = await spawnMutexHolderProcess(sessionId1);
            const { child: child2 } = await spawnMutexHolderProcess(sessionId2);
            processes.push(
                { child: child1, sessionId: sessionId1 },
                { child: child2, sessionId: sessionId2 }
            );

            const installExePath1 = path.join(fakeValidDir, getDotnetExecutable());
            const installExePath2 = path.join(os.tmpdir(), 'dotnet-test', getDotnetExecutable());
            tempFile = installExePath2; // Save for cleanup
            fs.mkdirSync(path.dirname(installExePath2), { recursive: true });
            fs.writeFileSync(installExePath2, 'fake-dotnet');


            // End any existing session from constructor
            await validator.endAnySingletonTrackingSessions();
            // Start a new session with our ID
            (validator as any).sessionId = validator.getSessionId();
            await validator.startNewSharedSingletonSession();

            await validator.markInstallAsInUseBySession(sessionId1, installExePath1);
            await validator.markInstallAsInUseBySession(sessionId2, installExePath2);

            // Both sessions are alive, so both installs should have live dependents
            const hasNoLiveDependents1 = await validator.installHasNoLiveDependents(installExePath1);
            const hasNoLiveDependents2 = await validator.installHasNoLiveDependents(installExePath2);

            assert.isFalse(hasNoLiveDependents1, 'First install should have live dependents');
            assert.isFalse(hasNoLiveDependents2, 'Second install should have live dependents');

            // Terminate the first process to simulate a session ending
            if (processes[0].child && !processes[0].child.killed)
            {
                processes[0].child.kill('SIGKILL');
            }

            // Give the system a moment to recognize the process is dead
            await new Promise(resolve => setTimeout(resolve, 1000));

            const hasNoLiveDependents1After = await validator.installHasNoLiveDependents(installExePath1);
            const hasNoLiveDependents2After = await validator.installHasNoLiveDependents(installExePath2);

            assert.isTrue(hasNoLiveDependents1After, 'First install should not have live dependents after its session died');
            assert.isFalse(hasNoLiveDependents2After, 'Second install should still have live dependents');
        }
        finally
        {
            await cleanupMutexHolders(processes);

            // Clean up the temporary file
            if (tempFile)
            {
                try
                {
                    fs.unlinkSync(tempFile);
                    fs.rmdirSync(path.dirname(tempFile), { recursive: true });
                } catch (e)
                {
                    // Ignore errors in cleanup
                }
            }
        }
    }).timeout(testTimeoutTime);

    test('It acquires permanent session mutex on construction', async () =>
    {
        const installTracker = new MockInstallTracker(mockContext.eventStream, mockContext.extensionState);
        const processes: { child: ChildProcess, sessionId: string }[] = [];

        try
        {
            // Try to acquire the same mutex in another process
            try
            {
                const result = await spawnMutexHolderProcess(installTracker.getSessionId());
                processes.push(result);
                assert.fail('Should not be able to acquire mutex that should be held by the validator');
            }
            catch (err)
            {
                // Expected - mutex should be held by the validator
                assert.isDefined(err, 'Should get an error when trying to acquire a mutex already held');
            }
        }
        finally
        {
            await cleanupMutexHolders(processes);
        }
    }).timeout(testTimeoutTime);

});
