/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { LoggingObserver } from '../../EventStream/LoggingObserver';
import { MockEventStream } from '../mocks/MockObjects';
import { DotnetUninstallAllStarted } from '../../EventStream/EventStreamEvents';
const assert = chai.assert;

suite('LoggingObserver Unit Tests', () => {
    const eventStream = new MockEventStream();
    const tempPath = path.join(__dirname,  `${ new Date().getTime()}` );

    test('Log file is writing output', async () => {
        // Create an empty folder
        if (!fs.existsSync(tempPath)) {
            fs.mkdirSync(tempPath);
        }
        // Create a logging observer
        const loggingObserver = new LoggingObserver(path.join(tempPath, 'logTest.txt'));

        // Create a fake event and call the post/dispose function
        const fakeEvent = new DotnetUninstallAllStarted();

        // Check if the log file content is same as expected content
        loggingObserver.post(fakeEvent);
        loggingObserver.dispose();

        fs.readdirSync(tempPath).forEach(file => {
            const logContent = fs.readFileSync(path.join(tempPath, file)).toString();
            assert.include(logContent, fakeEvent.eventName, 'The log file does not contain the expected content that should be written to it?');
        });

    });
});
