/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { DotnetUninstallAllStarted } from '../../EventStream/EventStreamEvents';
import { LoggingObserver } from '../../EventStream/LoggingObserver';
const assert = chai.assert;

suite('LoggingObserver Unit Tests', () =>
{
    const tempPath = path.join(__dirname, `${new Date().getTime()}`);

    test('Log file is writing output', async () =>
    {
        // Create an empty folder
        if (!fs.existsSync(tempPath))
        {
            fs.mkdirSync(tempPath);
        }
        // Create a logging observer
        const loggingObserver = new LoggingObserver(path.join(tempPath, 'logTest.txt'));

        // Create a fake event and call the post/flush function
        const fakeEvent = new DotnetUninstallAllStarted();
        loggingObserver.post(fakeEvent);
        await loggingObserver.flush();
        await loggingObserver.disposeAsync();

        // Check if the log file content is same as expected content
        fs.readdirSync(tempPath).forEach(file =>
        {
            const logContent = fs.readFileSync(path.join(tempPath, file)).toString();
            assert.include(logContent, fakeEvent.eventName, 'The log file does not contain the expected content that should be written to it');
        });

    }).timeout(10000 * 2);

    test('Flush clears the in-memory buffer', async () =>
    {
        const flushDir = path.join(tempPath, `flush-${Date.now()}`);
        fs.mkdirSync(flushDir, { recursive: true });
        const logPath = path.join(flushDir, 'logTest.txt');

        const loggingObserver = new LoggingObserver(logPath);
        const fakeEvent = new DotnetUninstallAllStarted();
        loggingObserver.post(fakeEvent);
        await loggingObserver.flush();

        // After flush, log should be on disk
        const contentAfterFlush = fs.readFileSync(logPath).toString();
        assert.include(contentAfterFlush, fakeEvent.eventName, 'Flushed content should be on disk');

        // Second flush with no new events should not grow the file
        const sizeAfterFlush = fs.statSync(logPath).size;
        await loggingObserver.flush();
        const sizeAfterSecondFlush = fs.statSync(logPath).size;
        assert.equal(sizeAfterFlush, sizeAfterSecondFlush, 'Empty flush should not grow the file');

        await loggingObserver.disposeAsync();
    }).timeout(10000 * 2);

    test('Multiple flushes append to the same file', async () =>
    {
        const appendDir = path.join(tempPath, `append-${Date.now()}`);
        fs.mkdirSync(appendDir, { recursive: true });
        const logPath = path.join(appendDir, 'logTest.txt');

        const loggingObserver = new LoggingObserver(logPath);
        const event1 = new DotnetUninstallAllStarted();
        loggingObserver.post(event1);
        await loggingObserver.flush();

        const event2 = new DotnetUninstallAllStarted();
        loggingObserver.post(event2);
        await loggingObserver.flush();

        const finalContent = fs.readFileSync(logPath).toString();
        const occurrences = finalContent.split(event1.eventName).length - 1;
        assert.equal(occurrences, 2, 'Both flushed events should appear in the file');

        await loggingObserver.disposeAsync();
    }).timeout(10000 * 2);

    test('Dispose flushes but does not stop the logger', async () =>
    {
        const disposeDir = path.join(tempPath, `dispose-${Date.now()}`);
        fs.mkdirSync(disposeDir, { recursive: true });
        const logPath = path.join(disposeDir, 'logTest.txt');

        const loggingObserver = new LoggingObserver(logPath);
        const event1 = new DotnetUninstallAllStarted();
        loggingObserver.post(event1);
        await loggingObserver.disposeAsync();

        const contentAfterDispose = fs.readFileSync(logPath).toString();
        assert.include(contentAfterDispose, event1.eventName, 'Pre-dispose event should be on disk');

        // Post after dispose should still work — dispose is just a flush
        loggingObserver.post(event1);
        await loggingObserver.flush();
        const contentAfterSecondPost = fs.readFileSync(logPath).toString();
        const occurrences = contentAfterSecondPost.split(event1.eventName).length - 1;
        assert.equal(occurrences, 2, 'Events posted after dispose() should still be logged');

        await loggingObserver.shutdown();
    }).timeout(10000 * 2);
});
