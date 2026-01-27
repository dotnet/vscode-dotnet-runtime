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
});
