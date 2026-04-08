/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { DotnetUninstallAllStarted } from '../../EventStream/EventStreamEvents';
import { EventStreamTaggingDecorator } from '../../EventStream/EventStreamTaggingDecorator';
import { LoggingObserver } from '../../EventStream/LoggingObserver';
import { MockEventStream } from '../mocks/MockObjects';
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

    test('Log includes actionId when event is tagged via EventStreamTaggingDecorator', async () =>
    {
        const taggedLogDir = path.join(tempPath, `tagged-${Date.now()}`);
        fs.mkdirSync(taggedLogDir, { recursive: true });

        const logPath = path.join(taggedLogDir, 'taggedLogTest.txt');
        const loggingObserver = new LoggingObserver(logPath);

        // Use the decorator wrapping a mock stream that forwards to the observer
        const mockStream = new MockEventStream();
        const decorator = new EventStreamTaggingDecorator(mockStream);

        // Post the event through the decorator; the event will be tagged with the actionId
        const fakeEvent = new DotnetUninstallAllStarted();
        decorator.post(fakeEvent);

        // The event was tagged by the decorator, so now post the tagged event to the observer
        loggingObserver.post(fakeEvent);
        await loggingObserver.disposeAsync();

        const logContent = fs.readFileSync(logPath).toString();
        assert.include(logContent, decorator.actionId, 'The log file should contain the actionId from the EventStreamTaggingDecorator');
        assert.include(logContent, fakeEvent.eventName, 'The log file should contain the event name');
    }).timeout(10000 * 2);

    test('EventStreamTaggingDecorator generates unique actionIds', () =>
    {
        const mockStream = new MockEventStream();
        const decorator1 = new EventStreamTaggingDecorator(mockStream);
        const decorator2 = new EventStreamTaggingDecorator(mockStream);
        assert.notEqual(decorator1.actionId, decorator2.actionId, 'Each decorator should have a unique actionId');
    });

    test('EventStreamTaggingDecorator accepts an explicit actionId', () =>
    {
        const mockStream = new MockEventStream();
        const explicitId = 'my-explicit-action-id';
        const decorator = new EventStreamTaggingDecorator(mockStream, explicitId);
        assert.equal(decorator.actionId, explicitId, 'Decorator should use the provided actionId');
    });

    test('Events without a tagged decorator have empty actionId in log', async () =>
    {
        const untaggedLogDir = path.join(tempPath, `untagged-${Date.now()}`);
        fs.mkdirSync(untaggedLogDir, { recursive: true });

        const logPath = path.join(untaggedLogDir, 'untaggedLogTest.txt');
        const loggingObserver = new LoggingObserver(logPath);

        const fakeEvent = new DotnetUninstallAllStarted();
        loggingObserver.post(fakeEvent);
        await loggingObserver.disposeAsync();

        const logContent = fs.readFileSync(logPath).toString();
        assert.notInclude(logContent, '[', 'Events without an actionId should not include brackets in the log line');
    }).timeout(10000 * 2);
});
