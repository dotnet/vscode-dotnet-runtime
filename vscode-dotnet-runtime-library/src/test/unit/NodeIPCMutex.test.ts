/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { fork } from 'child_process';
import * as path from 'path';
import { acquiredText, INodeIPCTestLogger, printWithLock, releasedText, wait } from './TestUtility';
const assert = chai.assert;

const taskAText = 'Task A';
const taskBText = 'Task B';
const childTaskFile = path.join(__dirname, '../mocks/MockRunTask.js');
const loggerForMultiFork = new INodeIPCTestLogger();
const loggerForHoldingDies = new INodeIPCTestLogger();
const loggerForHoldingDiesAfter = new INodeIPCTestLogger();

suite('Log Based NodeIPCMutex Unit Tests', function ()
{
    this.retries(4);

    function firstComesBeforeSecond(arr: string[], first: string, second: string): boolean
    {
        const firstIndex = arr.indexOf(first);
        const secondIndex = arr.indexOf(second);
        return firstIndex < secondIndex && firstIndex !== -1 && secondIndex !== -1;
    }

    test('Events queued in order and waits', async () =>
    {
        const logger = new INodeIPCTestLogger();
        const myLock = `EventQueueTestMutex`;

        printWithLock(myLock, taskAText, 500, logger);
        await wait(100);
        assert(logger.logs.includes(`${acquiredText}${taskAText}`), `${logger.logs} A acquires the lock when nobody holds it`);
        assert(!logger.logs.includes(`${releasedText}${taskAText}`), `${logger.logs} A does not release the lock during the function execution`);

        try
        {
            printWithLock(myLock, taskBText, 100, logger);
        }
        catch (e: any)
        {
            // noop
        }
        assert(!logger.logs.includes(`${acquiredText}${taskBText}`), `${logger.logs} B does not acquire A when A is still working and B timed out`);

        await wait(500); // Wait for A to finish and release the lock.
        printWithLock(myLock, taskBText, 100, logger);
        await wait(100); // Wait for B to finish and release the lock.

        assert(logger.logs.includes(`${acquiredText}${taskBText}`), `${logger.logs} B was able to get A after A finished.`);
        assert(firstComesBeforeSecond(logger.logs, `${acquiredText}${taskAText}`, `${acquiredText}${taskBText}`), `${logger.logs} A acquired before B`);
    }).timeout(10000 * 2);

    test('It can communicate with another task while it is active', async () =>
    {
        const logger = new INodeIPCTestLogger();
        const myLock = `ItCanCommunicateWithAnotherTaskWhileItIsActiveMutex`;

        printWithLock(myLock, taskAText, 500, logger);
        await wait(100);
        printWithLock(myLock, taskBText, 500, logger);

        await wait(500);

        assert(logger.logs.includes(`${acquiredText}${taskBText}`), `${logger.logs} B was able to get the lock even if it started while A was running.`);
        assert(firstComesBeforeSecond(logger.logs, `${acquiredText}${taskAText}`, `${acquiredText}${taskBText}`), `${logger.logs} A acquired before B`);
    });

    test('Multiple processes share the mutex correctly', async () =>
    {
        const myLock = `MultipleProcessesShareTheMutexCorrectlyMutex`;

        const child = fork(childTaskFile, [taskAText, '5500', myLock]);
        child.on('message', (msg) =>
        {
            loggerForMultiFork.logs = loggerForMultiFork.logs.concat((msg as any).message);
        });


        try
        {
            // Fork a child process to simulate "Process B" with the default timeout
            child.send({ run: true }); // Give it the logger so it logs to our memory, and tell it to printWithLock
            await wait(4000);

            printWithLock(myLock, taskBText, 4500, loggerForMultiFork);

            await wait(7000);

            assert(loggerForMultiFork.logs.includes(`${acquiredText}${taskBText}`), `${loggerForMultiFork.logs} B was able to get the lock even if it started while A was running.`);
            assert(firstComesBeforeSecond(loggerForMultiFork.logs, `${acquiredText}${taskAText}`, `${acquiredText}${taskBText}`), `${loggerForMultiFork.logs} A acquired before B`);
            assert(firstComesBeforeSecond(loggerForMultiFork.logs, `${releasedText}${taskAText}`, `${acquiredText}${taskBText}`), `${loggerForMultiFork.logs} A released before B acquired`);
        }
        finally
        {
            child.kill(); // Clean up the child process.
        }
    });

    test('It can acquire if the holding process dies if it was not dead at the others first acquire attempt', async () =>
    {
        const myLock = `HoldingProcessDiesMutex`;

        // Child is now Task A
        const child = fork(childTaskFile, [taskAText, '5700', myLock]);
        child.on('message', (msg) =>
        {
            loggerForHoldingDies.logs = loggerForHoldingDies.logs.concat((msg as any).message);
        });

        try
        {
            child.send({ run: true });
            await wait(4000);

            assert(loggerForHoldingDies.logs.includes(`${acquiredText}${taskAText}`), `${loggerForHoldingDies.logs} child process (A) was able to get the lock.`);
            printWithLock(myLock, taskBText, 5500, loggerForHoldingDies);
            child.kill('SIGKILL');

            await wait(7000);

            assert(firstComesBeforeSecond(loggerForHoldingDies.logs, `${acquiredText}${taskAText}`, `${acquiredText}${taskBText}`), `${loggerForHoldingDies.logs} A acquired before B`);
            assert(loggerForHoldingDies.logs.includes(`${acquiredText}${taskBText}`), `${loggerForHoldingDies.logs} B was able to get the lock even if A died when A had it, and A was first.`);
            assert(!loggerForHoldingDies.logs.includes(`${releasedText}${taskAText}`), `${loggerForHoldingDies.logs} A was forcefully terminated, so it never properly released the lock.`);
        }
        finally
        {
            child.kill(); // Clean up the child process.
        }
    }).timeout(10000 * 2);

    test('It can lock even if the holding process dies before the next process begins', async () =>
    {
        const myLock = `HoldingProcessDiesBeforeNextProcessBeginsMutex`;

        // Child is now Task A
        const child = fork(childTaskFile, [taskAText, '5500', myLock]);
        child.on('message', (msg) =>
        {
            loggerForHoldingDiesAfter.logs = loggerForHoldingDiesAfter.logs.concat((msg as any).message);
        });

        try
        {
            child.send({ run: true }); // Give it the logger so it knows.
            await wait(4000);

            assert(loggerForHoldingDiesAfter.logs.includes(`${acquiredText}${taskAText}`), `${loggerForHoldingDiesAfter.logs} Child process A was able to get the lock`);
            child.kill('SIGKILL');
            printWithLock(myLock, taskBText, 5200, loggerForHoldingDiesAfter);

            await wait(7000); // Wait for A to finish and release the lock.

            assert(firstComesBeforeSecond(loggerForHoldingDiesAfter.logs, `${acquiredText}${taskAText}`, `${acquiredText}${taskBText}`), `${loggerForHoldingDiesAfter.logs} A acquired before B`);
            assert(loggerForHoldingDiesAfter.logs.includes(`${acquiredText}${taskBText}`), `${loggerForHoldingDiesAfter.logs} B was able to get the lock even if A died when A had it, and B started after A died.`);
            assert(!loggerForHoldingDiesAfter.logs.includes(`${releasedText}${taskAText}`), `${loggerForHoldingDiesAfter.logs} A was forcefully terminated, so it never properly released the lock.`);
        }
        finally
        {
            child.kill(); // Clean up the child process.
        }
    }).timeout(10000 * 2);
});
