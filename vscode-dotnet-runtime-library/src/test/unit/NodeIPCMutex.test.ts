/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { fork } from 'child_process';
import * as path from 'path';
import { executeWithLock } from '../../Utils/TypescriptUtilities';
import { MockEventStream } from '../mocks/MockObjects';
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
});
