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
        loggingObserver.dispose();

        // Check if the log file content is same as expected content
        fs.readdirSync(tempPath).forEach(file =>
        {
            const logContent = fs.readFileSync(path.join(tempPath, file)).toString();
            assert.include(logContent, fakeEvent.eventName, 'The log file does not contain the expected content that should be written to it');
        });

    }).timeout(10000 * 2);
});
