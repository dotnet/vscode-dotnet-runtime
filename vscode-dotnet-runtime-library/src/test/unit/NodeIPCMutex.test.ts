/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { fork } from 'child_process';
import * as fs from 'fs';
import { createServer } from 'net';
import * as os from 'os';
import * as path from 'path';
import { executeWithLock } from '../../Utils/TypescriptUtilities';
import { MockEventStream, MockNodeIPCMutex } from '../mocks/MockObjects';
import { acquiredText, INodeIPCTestLogger, printWithLock, releasedText, wait } from './TestUtility';
const assert = chai.assert;

const taskAText = 'Task A';
const taskBText = 'Task B';
const childTaskFile = path.join(__dirname, '../mocks/MockRunTask.js');
const loggerForMultiFork = new INodeIPCTestLogger();
const loggerForHoldingDies = new INodeIPCTestLogger();
const loggerForHoldingDiesAfter = new INodeIPCTestLogger();
const manualDebug = false;
const delayFactor = 1.2;
const testTimeoutMs = 10000 * 2 * delayFactor; // 20 seconds
const randomLockPrefixArr = new Uint16Array(3);
const randomTextPrefixes = crypto.getRandomValues(randomLockPrefixArr);
const randomLockPrefix = randomTextPrefixes.join(''); // If the code is wrong and processes don't die, rerunning tests may fail if the old one is not finished yet.

suite('NodeIPCMutex Unit Tests', function ()
{
    this.retries(0);

    /**
     * Probes the real kernel behavior of server.listen() when the parent directory of the socket
     * path is not writable: bind() cannot create the socket inode, so the kernel emits EACCES.
     * Returns the errno code string, or 'LISTEN_SUCCEEDED' if listen somehow succeeded (e.g. root).
     */
    async function probeListenErrnoOnUnwritableParent(): Promise<string>
    {
        const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodeipc-parent-'));
        const probePath = path.join(probeDir, 'probe.sock');

        // Read+execute but NOT write on the parent directory -> bind() can resolve the path but
        // cannot create a new inode -> EACCES.
        fs.chmodSync(probeDir, 0o500);

        try
        {
            return await new Promise<string>((resolve) =>
            {
                const server = createServer();
                server.once('error', (err: NodeJS.ErrnoException) => resolve(err.code ?? 'UNEXPECTED'));
                server.once('listening', () =>
                {
                    server.close();
                    resolve('LISTEN_SUCCEEDED');
                });
                try { server.listen(probePath); }
                catch (err: any)
                {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    resolve((err?.code as string) ?? 'UNEXPECTED');
                }
            });
        }
        finally
        {
            try { fs.chmodSync(probeDir, 0o755); } catch { /* best effort */ }
            try { fs.rmdirSync(probeDir); } catch { /* best effort */ }
        }
    }

    function firstComesBeforeSecond(arr: string[], first: string, second: string): boolean
    {
        const firstIndex = arr.indexOf(first);
        const secondIndex = arr.indexOf(second);
        return firstIndex < secondIndex && firstIndex !== -1 && secondIndex !== -1;
    }

    test('Events queued in order and waits', async () =>
    {
        const logger = new INodeIPCTestLogger();
        const myLock = `${randomLockPrefix}-EQ`;

        printWithLock(myLock, taskAText, 500 * delayFactor, logger);
        await wait(100 * delayFactor);
        assert(logger.logs.includes(`${acquiredText}${taskAText}`), `${logger.logs}
 A acquires the lock when nobody holds it`);
        assert(!logger.logs.includes(`${releasedText}${taskAText}`), `${logger.logs}
 A does not release the lock during the function execution`);

        try
        {
            printWithLock(myLock, taskBText, 100 * delayFactor, logger);
        }
        catch (e: any)
        {
            // noop
        }
        assert(!logger.logs.includes(`${acquiredText}${taskBText}`), `${logger.logs}
 B does not acquire A when A is still working and B timed out`);

        await wait(500 * delayFactor); // Wait for A to finish and release the lock.
        printWithLock(myLock, taskBText, 100 * delayFactor, logger);
        await wait(100 * delayFactor); // Wait for B to finish and release the lock.

        assert(logger.logs.includes(`${acquiredText}${taskBText}`), `${logger.logs}
 B was able to get A after A finished.`);
        assert(firstComesBeforeSecond(logger.logs, `${acquiredText}${taskAText}`, `${acquiredText}${taskBText}`), `${logger.logs}
 A acquired before B`);
    }).timeout(testTimeoutMs);

    test('It can communicate with another task while it is active', async () =>
    {
        const logger = new INodeIPCTestLogger();
        const myLock = `${randomLockPrefix}-IC`;

        printWithLock(myLock, taskAText, 500 * delayFactor, logger);
        await wait(100 * delayFactor);
        printWithLock(myLock, taskBText, 500 * delayFactor, logger);

        await wait(800 * delayFactor);

        assert(logger.logs.includes(`${acquiredText}${taskBText}`), `${logger.logs}
 B was able to get the lock even if it started while A was running.`);
        assert(firstComesBeforeSecond(logger.logs, `${acquiredText}${taskAText}`, `${acquiredText}${taskBText}`), `${logger.logs}
 A acquired before B`);
    }).timeout(testTimeoutMs);

    test('Multiple processes share the mutex correctly', async () =>
    {
        const myLock = `${randomLockPrefix}-SM`;

        const child = fork(childTaskFile, [taskAText, (5500 * delayFactor).toString(), myLock]);
        child.on('message', (msg) =>
        {
            loggerForMultiFork.logs = loggerForMultiFork.logs.concat((msg as any).message);
        });


        try
        {
            // Fork a child process to simulate "Process B" with the default timeout
            child.send({ run: true }); // Give it the logger so it logs to our memory, and tell it to printWithLock
            await wait(4000 * delayFactor);

            printWithLock(myLock, taskBText, 4500 * delayFactor, loggerForMultiFork);

            await wait(8000 * delayFactor);

            assert(loggerForMultiFork.logs.includes(`${acquiredText}${taskBText}`), `${loggerForMultiFork.logs}
 B was able to get the lock even if it started while A was running.`);
            assert(firstComesBeforeSecond(loggerForMultiFork.logs, `${acquiredText}${taskAText}`, `${acquiredText}${taskBText}`), `${loggerForMultiFork.logs}
 A acquired before B`);
            assert(firstComesBeforeSecond(loggerForMultiFork.logs, `${releasedText}${taskAText}`, `${acquiredText}${taskBText}`), `${loggerForMultiFork.logs}
 A released before B acquired`);
        }
        finally
        {
            child.kill(); // Clean up the child process.
        }
    }).timeout(testTimeoutMs);

    test('It can acquire if the holding process dies if it was not dead at the others first acquire attempt', async () =>
    {
        const myLock = `${randomLockPrefix}-DN`;

        // Child is now Task A
        const child = fork(childTaskFile, [taskAText, (5700 * delayFactor).toString(), myLock]);
        child.on('message', (msg) =>
        {
            loggerForHoldingDies.logs = loggerForHoldingDies.logs.concat((msg as any).message);
        });

        try
        {
            child.send({ run: true });
            await wait(4000 * delayFactor);

            assert(loggerForHoldingDies.logs.includes(`${acquiredText}${taskAText}`), `${loggerForHoldingDies.logs}
 child process (A) was able to get the lock.`);
            printWithLock(myLock, taskBText, 5500 * delayFactor, loggerForHoldingDies);
            child.kill('SIGKILL');

            await wait(9000 * delayFactor);

            assert(firstComesBeforeSecond(loggerForHoldingDies.logs, `${acquiredText}${taskAText}`, `${acquiredText}${taskBText}`), `${loggerForHoldingDies.logs}
 A acquired before B`);
            assert(loggerForHoldingDies.logs.includes(`${acquiredText}${taskBText}`), `${loggerForHoldingDies.logs}
 B was able to get the lock even if A died when A had it, and A was first.`);
            assert(!loggerForHoldingDies.logs.includes(`${releasedText}${taskAText}`), `${loggerForHoldingDies.logs}
 A was forcefully terminated, so it never properly released the lock.`);
        }
        finally
        {
            child.kill(); // Clean up the child process.
        }
    }).timeout(testTimeoutMs);

    test('It can lock even if the holding process dies before the next process begins', async () =>
    {
        const myLock = `${randomLockPrefix}-DN`;

        // Child is now Task A
        const child = fork(childTaskFile, [taskAText, (5500 * delayFactor).toString(), myLock]);
        child.on('message', (msg) =>
        {
            loggerForHoldingDiesAfter.logs = loggerForHoldingDiesAfter.logs.concat((msg as any).message);
        });

        try
        {
            child.send({ run: true }); // Give it the logger so it knows.
            await wait(4000 * delayFactor);

            assert(loggerForHoldingDiesAfter.logs.includes(`${acquiredText}${taskAText}`), `${loggerForHoldingDiesAfter.logs}
 Child process A was able to get the lock`);
            child.kill('SIGKILL');
            printWithLock(myLock, taskBText, 5200 * delayFactor, loggerForHoldingDiesAfter);

            await wait(9000 * delayFactor); // Wait for A to finish and release the lock.

            assert(firstComesBeforeSecond(loggerForHoldingDiesAfter.logs, `${acquiredText}${taskAText}`, `${acquiredText}${taskBText}`), `${loggerForHoldingDiesAfter.logs}
 A acquired before B`);
            assert(loggerForHoldingDiesAfter.logs.includes(`${acquiredText}${taskBText}`), `${loggerForHoldingDiesAfter.logs}
 B was able to get the lock even if A died when A had it, and B started after A died.`);
            assert(!loggerForHoldingDiesAfter.logs.includes(`${releasedText}${taskAText}`), `${loggerForHoldingDiesAfter.logs}
 A was forcefully terminated, so it never properly released the lock.`);
        }
        finally
        {
            child.kill(); // Clean up the child process.
        }
    }).timeout(testTimeoutMs);

    test('It respects VSCODE_DOTNET_RUNTIME_DISABLE_MUTEX', async () =>
    {
        try
        {
            process.env.VSCODE_DOTNET_RUNTIME_DISABLE_MUTEX = 'true';
            const logger = new INodeIPCTestLogger();
            logger.log = (msg: string) => { throw new Error('Fail the test because we tried to use a lock even though VSCODE_DOTNET_RUNTIME_DISABLE_MUTEX is true'); }
            const myLock = `${randomLockPrefix}-EV`;

            executeWithLock(new MockEventStream(), false, myLock, 1000 * delayFactor, 5000 * delayFactor, async () =>
            {
                { // noop. If it doesn't throw, it means the lock was not used, which means this should pass.
                }
            });
        }
        finally
        {
            delete process.env.VSCODE_DOTNET_RUNTIME_DISABLE_MUTEX;
        }
    }).timeout(testTimeoutMs);

    /**
     * Preflight: independently confirm that chmod 0500 on the parent directory causes
     * `server.listen()` to emit EACCES. If this probe stops producing EACCES, the assumptions
     * behind the listen-EACCES tests below are invalid.
     */
    test('Preflight: unwritable parent directory causes server.listen() to emit EACCES', async function ()
    {
        if (os.platform() === 'win32')
        {
            this.skip();
            return;
        }

        const code = await probeListenErrnoOnUnwritableParent();

        if (code === 'LISTEN_SUCCEEDED')
        {
            // Happens when running as root: DAC is bypassed. Skip rather than falsely pass downstream.
            this.skip();
            return;
        }

        assert.strictEqual(code, 'EACCES',
            `Expected EACCES from server.listen() on a path in an unwritable parent directory, but got '${code}'.`);
    }).timeout(testTimeoutMs);

    /**
     * When server.listen() raises EACCES because the parent directory is unwritable, the mutex
     * must not surface the raw libuv error. It should classify EACCES as retryable and eventually
     * time out with a graceful error.
     */
    test('It does not crash immediately when server.listen throws EACCES (unwritable parent directory)', async function ()
    {
        if (os.platform() === 'win32')
        {
            this.skip();
            return;
        }

        const probeCode = await probeListenErrnoOnUnwritableParent();
        if (probeCode !== 'EACCES')
        {
            this.skip();
            return;
        }

        const logger = new INodeIPCTestLogger();
        const myLock = `${randomLockPrefix}-UP`;
        const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodeipc-unwritable-'));
        fs.chmodSync(testDir, 0o500);

        const mutex = new MockNodeIPCMutex(myLock, logger, testDir);

        let caught: any;
        let acquired = false;
        try
        {
            await mutex.acquire(async () =>
            {
                acquired = true;
                return 'done';
            }, 50, 500, `${myLock}-unwritable-parent-test`);
        }
        catch (err)
        {
            caught = err;
        }
        finally
        {
            try { fs.chmodSync(testDir, 0o755); } catch { /* best effort */ }
            try { fs.rmdirSync(testDir); } catch { /* best effort */ }
        }

        assert(!acquired, `The mutex should not acquire the lock while the parent directory is unwritable.`);
        assert(caught, `${logger.logs}\nThe mutex should have thrown a timeout error.`);
        const msg = String(caught?.message ?? '');
        assert(msg.includes('Failed to acquire lock'), `Expected graceful timeout error, got: ${msg}`);
        assert(!msg.startsWith('listen EACCES'), `Raw libuv EACCES should not be surfaced. Got: ${msg}`);
        assert(logger.logs.some(l => l.includes('EACCES')),
            `${logger.logs}\nExpected EACCES in the retry-loop logs.`);
    }).timeout(testTimeoutMs);

    /**
     * Recovery test: start with an unwritable parent directory (real EACCES from listen), then
     * mid-retry restore write permissions. The mutex must recover and acquire the lock.
     */
    test('It recovers when a previously unwritable parent directory becomes writable mid-retry', async function ()
    {
        if (os.platform() === 'win32')
        {
            this.skip();
            return;
        }

        const probeCode = await probeListenErrnoOnUnwritableParent();
        if (probeCode !== 'EACCES')
        {
            this.skip();
            return;
        }

        const logger = new INodeIPCTestLogger();
        const myLock = `${randomLockPrefix}-RC`;
        const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodeipc-recover-'));
        fs.chmodSync(testDir, 0o500);

        const mutex = new MockNodeIPCMutex(myLock, logger, testDir);
        const sockPath = mutex.getLockPathForTest();

        // Unbreak the environment after a few retries have definitely occurred.
        const unbreakAfterMs = 300;
        const restore = setTimeout(() =>
        {
            try { fs.chmodSync(testDir, 0o755); } catch { /* best effort */ }
        }, unbreakAfterMs);

        let acquired = false;
        let caught: any;
        try
        {
            await mutex.acquire(async () =>
            {
                acquired = true;
                return 'done';
            }, 50, 3000, `${myLock}-recover-test`);
        }
        catch (err)
        {
            caught = err;
        }
        finally
        {
            clearTimeout(restore);
            try { fs.chmodSync(testDir, 0o755); } catch { /* best effort */ }
            try { fs.unlinkSync(sockPath); } catch { /* best effort */ }
            try { fs.rmdirSync(testDir); } catch { /* best effort */ }
        }

        assert(!caught, `${logger.logs}\nThe mutex should have recovered once the directory became writable. Error: ${String(caught?.message ?? '')}`);
        assert(acquired, `${logger.logs}\nThe mutex should have acquired the lock after recovery.`);
        assert(logger.logs.some(l => l.includes('EACCES')),
            `${logger.logs}\nExpected EACCES in the retry-loop logs before recovery.`);
    }).timeout(testTimeoutMs);

    /**
     * Independent real-EACCES witness using filesystem root "/". A non-root process cannot bind
     * in "/", so `server.listen()` emits EACCES with no chmod/mkdtemp setup required.
     * Skipped under root and on Windows.
     */
    test('It does not crash immediately when server.listen throws real EACCES (root directory primitive)', async function ()
    {
        if (os.platform() === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0))
        {
            this.skip();
            return;
        }

        const logger = new INodeIPCTestLogger();
        const myLock = `${randomLockPrefix}-RD`;
        const mutex = new MockNodeIPCMutex(myLock, logger, '/');

        let caught: any;
        let acquired = false;
        try
        {
            await mutex.acquire(async () =>
            {
                acquired = true;
                return 'done';
            }, 50, 400, `${myLock}-rootdir-test`);
        }
        catch (err)
        {
            caught = err;
        }

        assert(!acquired, `The mutex should not acquire a lock when "/" is unwritable.`);
        assert(caught, `${logger.logs}\nThe mutex should time out, not hang.`);
        const msg = String(caught?.message ?? '');
        assert(msg.includes('Failed to acquire lock'), `Expected graceful timeout, got: ${msg}`);
        assert(!msg.startsWith('listen EACCES'), `Raw libuv EACCES should not be surfaced. Got: ${msg}`);
        assert(logger.logs.some(l => l.includes('EACCES')),
            `${logger.logs}\nExpected EACCES in the retry-loop logs.`);
    }).timeout(testTimeoutMs);
});
