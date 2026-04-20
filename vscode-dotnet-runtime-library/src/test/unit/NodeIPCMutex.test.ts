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
     * Probes the real-world scenario where the parent directory of the socket path is not writable
     * by the current process: `server.listen()` throws EACCES because bind() cannot create the
     * socket inode in an unwritable directory.
     *
     * This is what actually happens with `/run/user/<uid>/vscd-*.sock` when:
     *   - The process's effective uid differs from the owner of /run/user/<uid>/ (sudo/su, container
     *     uid mismatch, WSL uid mapping).
     *   - The logind session was torn down but XDG_RUNTIME_DIR is still inherited.
     *   - Any other cause of a stale/inaccessible XDG_RUNTIME_DIR.
     *
     * See the caveat documented in NodeIPCMutex.getIPCDirectory().
     *
     * Empirically verified on Linux (Node 20+): chmod 0500 on the parent dir produces `EACCES`
     * from server.listen() (exactly matching observed user crash logs) and `ENOENT` from
     * createConnection (since no file was ever created).
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
     * `server.listen()` to emit EACCES. This reproduces the real-world failure mode observed in
     * user crash logs, where `listen EACCES: permission denied /run/user/<uid>/vscd-*.sock` bubbled
     * up from a logind-managed XDG_RUNTIME_DIR that the current process could no longer write to.
     *
     * If this probe ever stops producing EACCES, the assumptions behind the listen-EACCES-handling
     * test below are invalid.
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
            `Expected server.listen() on a path in an unwritable parent directory to emit EACCES, ` +
            `but got '${code}'. This invalidates the unwritable-parent-directory test's assumption. ` +
            `User-reported crash logs showed EACCES from this code path in real deployments.`);
    }).timeout(testTimeoutMs);

    /**
     * Real-world unwritable-XDG_RUNTIME_DIR scenario test (Linux/macOS only).
     *
     * Reproduces the crash observed in user logs:
     *   Error: listen EACCES: permission denied /run/user/<uid>/vscd-installedLk.sock
     *
     * Root cause in the field: `XDG_RUNTIME_DIR` points at a directory the current process cannot
     * write to (stale session, uid mismatch from sudo/su, container/WSL uid mapping, logind
     * teardown while VS Code process still running). bind() cannot create the socket inode there,
     * so the kernel returns EACCES on `server.listen()`.
     *
     * Before the fix, the mutex rethrew immediately because of the EACCESS->EACCES typo in the
     * retryable set, producing the ugly libuv stack trace visible in user logs.
     *
     * After the fix, the mutex catches EACCES, classifies it as retryable, tries isLockStale (which
     * also fails due to the unwritable directory), and tries cleanupStaleLock (which also fails).
     * Unable to recover — because the environment itself is broken — the mutex times out and throws
     * a meaningful "Failed to acquire lock after N retries" error instead of the raw libuv trace.
     *
     * This test verifies the new behavior: no immediate crash with libuv internals; instead a
     * graceful, retry-bounded timeout with an actionable error message.
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

        // Build a read+execute-only parent directory. bind() in server.listen() will fail with
        // EACCES because it cannot create the socket inode.
        const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodeipc-unwritable-'));
        fs.chmodSync(testDir, 0o500);

        const mutex = new MockNodeIPCMutex(myLock, logger, testDir);

        let caught: any;
        let acquired = false;
        try
        {
            // Give it a short budget: we EXPECT the mutex to eventually time out gracefully, since
            // the environment is genuinely broken — no real recovery is possible.
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

        assert(!acquired, `The mutex should NOT have acquired the lock in a permanently-broken environment.`);
        assert(caught, `${logger.logs}\nThe mutex should have thrown a meaningful timeout error after retries were exhausted.`);
        // The message must be the graceful timeout, NOT the raw libuv "listen EACCES" stack trace.
        // This is the crux of the user-visible improvement.
        const msg = String(caught?.message ?? '');
        assert(msg.includes('Failed to acquire lock'),
            `Expected the final error to be the graceful "Failed to acquire lock after N retries" ` +
            `message, but got: ${msg}\nLogs: ${logger.logs}`);
        assert(!msg.startsWith('listen EACCES'),
            `The mutex should NOT surface the raw libuv "listen EACCES" error to callers — ` +
            `that was the bug. Got: ${msg}`);
        // The EACCES must have been observed in the logs during retries. This is the direct proof
        // that the retryable-set fix engaged: pre-fix, EACCES was rethrown immediately and never
        // reached the "Unable to acquire lock" logging path in isLockStale's fallthrough branch.
        assert(logger.logs.some(l => l.includes('EACCES')),
            `${logger.logs}\nExpected EACCES to appear in the retry-loop logs, proving the ` +
            `retryable-code fix engaged. If this fails, the EACCES was swallowed silently or the ` +
            `retry loop never ran.`);
    }).timeout(testTimeoutMs);

    /**
     * Independent real-EACCES test using the filesystem root "/".
     *
     * On Unix, `server.listen('/vscd-probe.sock')` as a non-root user produces EACCES from bind()
     * because the process lacks write permission on "/". No chmod setup, no mkdtemp, no cleanup is
     * needed: the kernel rejects the bind before any inode is created.
     *
     * This is a second independent witness for the same code path as the unwritable-parent test.
     * If one test regresses (e.g. a future refactor changes how chmod is handled, or Node changes
     * errno mapping), the other remains as a check.
     *
     * Skipped under root (bind would succeed and leak a socket file in /) and on Windows.
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
        // Override the IPC directory to "/" — bind into "/" fails with EACCES for non-root.
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

        assert(!acquired, `The mutex should NOT acquire a lock when "/" is unwritable.`);
        assert(caught, `${logger.logs}\nThe mutex should time out gracefully, not hang.`);
        const msg = String(caught?.message ?? '');
        assert(msg.includes('Failed to acquire lock'),
            `Expected graceful "Failed to acquire lock" timeout, got: ${msg}\nLogs: ${logger.logs}`);
        assert(!msg.startsWith('listen EACCES'),
            `Raw libuv EACCES must not be surfaced to callers. Got: ${msg}`);
        assert(logger.logs.some(l => l.includes('EACCES')),
            `${logger.logs}\nExpected EACCES in the retry-loop logs.`);
    }).timeout(testTimeoutMs);
});
