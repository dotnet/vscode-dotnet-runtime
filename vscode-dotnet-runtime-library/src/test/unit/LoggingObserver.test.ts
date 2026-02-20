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

        // Create a fake event and call the post/dispose function
        const fakeEvent = new DotnetUninstallAllStarted();
        loggingObserver.post(fakeEvent);
        await loggingObserver.disposeAsync();

        // Check if the log file content is same as expected content
        fs.readdirSync(tempPath).forEach(file =>
        {
            const logContent = fs.readFileSync(path.join(tempPath, file)).toString();
            assert.include(logContent, fakeEvent.eventName, 'The log file does not contain the expected content that should be written to it');
        });

    }).timeout(10000 * 2);

    test('It retains existing log when new log is smaller', async () =>
    {
        const existingLogDir = path.join(tempPath, `retain-${Date.now()}`);
        fs.mkdirSync(existingLogDir, { recursive: true });

        const logPath = path.join(existingLogDir, 'logTest.txt');
        const existingContent = 'existing-log-contents-should-remain';
        fs.writeFileSync(logPath, existingContent);

        const loggingObserver = new LoggingObserver(logPath);
        await loggingObserver.disposeAsync();

        const finalContent = fs.readFileSync(logPath).toString();
        assert.equal(finalContent, existingContent, 'Existing larger log should not be replaced by a smaller new log');
    }).timeout(10000 * 2);

    test('Log includes commandId when event is tagged via EventStreamTaggingDecorator', async () =>
    {
        const taggedLogDir = path.join(tempPath, `tagged-${Date.now()}`);
        fs.mkdirSync(taggedLogDir, { recursive: true });

        const logPath = path.join(taggedLogDir, 'taggedLogTest.txt');
        const loggingObserver = new LoggingObserver(logPath);

        // Use the decorator wrapping a mock stream that forwards to the observer
        const mockStream = new MockEventStream();
        const decorator = new EventStreamTaggingDecorator(mockStream);

        // Post the event through the decorator; the event will be tagged with the commandId
        const fakeEvent = new DotnetUninstallAllStarted();
        decorator.post(fakeEvent);

        // The event was tagged by the decorator, so now post the tagged event to the observer
        loggingObserver.post(fakeEvent);
        await loggingObserver.disposeAsync();

        const logContent = fs.readFileSync(logPath).toString();
        assert.include(logContent, decorator.commandId, 'The log file should contain the commandId from the EventStreamTaggingDecorator');
        assert.include(logContent, fakeEvent.eventName, 'The log file should contain the event name');
    }).timeout(10000 * 2);

    test('EventStreamTaggingDecorator generates unique commandIds', () =>
    {
        const mockStream = new MockEventStream();
        const decorator1 = new EventStreamTaggingDecorator(mockStream);
        const decorator2 = new EventStreamTaggingDecorator(mockStream);
        assert.notEqual(decorator1.commandId, decorator2.commandId, 'Each decorator should have a unique commandId');
    });

    test('EventStreamTaggingDecorator accepts an explicit commandId', () =>
    {
        const mockStream = new MockEventStream();
        const explicitId = 'my-explicit-command-id';
        const decorator = new EventStreamTaggingDecorator(mockStream, explicitId);
        assert.equal(decorator.commandId, explicitId, 'Decorator should use the provided commandId');
    });

    test('Events without a tagged decorator have empty commandId in log', async () =>
    {
        const untaggedLogDir = path.join(tempPath, `untagged-${Date.now()}`);
        fs.mkdirSync(untaggedLogDir, { recursive: true });

        const logPath = path.join(untaggedLogDir, 'untaggedLogTest.txt');
        const loggingObserver = new LoggingObserver(logPath);

        const fakeEvent = new DotnetUninstallAllStarted();
        loggingObserver.post(fakeEvent);
        await loggingObserver.disposeAsync();

        const logContent = fs.readFileSync(logPath).toString();
        assert.notInclude(logContent, '[', 'Events without a commandId should not include brackets in the log line');
    }).timeout(10000 * 2);
});
