/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import { DotnetCommandFailed, DotnetCommandSucceeded } from '../../EventStream/EventStreamEvents';
import {
    errorConstants,
    timeoutConstants,
    UninstallErrorConfiguration,
} from '../../Utils/ErrorHandler';
import { callWithErrorHandling } from '../../Utils/ErrorHandler';
import { IIssueContext } from '../../Utils/IIssueContext';
import { MockEventStream, MockLoggingObserver } from '../mocks/MockObjects';
import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';
const assert = chai.assert;

suite('ErrorHandler Unit Tests', () => {
    const issueContext = (displayWorker: MockWindowDisplayWorker, eventStream: MockEventStream) => {
        return {
            logger: new MockLoggingObserver(),
            errorConfiguration: UninstallErrorConfiguration.DisplayAllErrorPopups,
            displayWorker,
            eventStream,
            commandName: 'test',
        } as IIssueContext;
    };

    test('No error popup is displayed when there is no error', async () => {
        const displayWorker = new MockWindowDisplayWorker();
        const res = await callWithErrorHandling<string>(() => {
            return '';
        }, issueContext(displayWorker, new MockEventStream()));

        assert.equal(displayWorker.errorMessage, '');
        assert.equal(displayWorker.clipboardText, '');
    });

    test('Error popup appears on error', async () => {
        const errorString = 'Fake error message';
        const displayWorker = new MockWindowDisplayWorker();
        const res = await callWithErrorHandling<string>(() => {
            displayWorker.copyToUserClipboard(errorString);
            throw new Error(errorString);
        }, issueContext(displayWorker, new MockEventStream()));

        assert.include(displayWorker.errorMessage, errorString);
        assert.include(displayWorker.clipboardText, errorString);
        assert.includeMembers(displayWorker.options, [errorConstants.reportOption, errorConstants.hideOption]);
    });

    test('Timeout popup appears on timeout', async () => {
        const displayWorker = new MockWindowDisplayWorker();
        const res = await callWithErrorHandling<string>(() => {
            throw new Error(timeoutConstants.timeoutMessage);
        }, issueContext(displayWorker, new MockEventStream()));

        assert.include(displayWorker.errorMessage, timeoutConstants.timeoutMessage);
        assert.equal(displayWorker.clipboardText, '');
        assert.includeMembers(displayWorker.options, [timeoutConstants.moreInfoOption]);
    });

    test('Successful command events are reported', async () => {
        const displayWorker = new MockWindowDisplayWorker();
        const eventStream = new MockEventStream();
        const res = await callWithErrorHandling<string>(() => {
            return '';
        }, issueContext(displayWorker, eventStream));

        assert.exists(eventStream.events.find(event => event instanceof DotnetCommandSucceeded));
    });

    test('Failed command events are reported', async () => {
        const displayWorker = new MockWindowDisplayWorker();
        const eventStream = new MockEventStream();
        const res = await callWithErrorHandling<string>(() => {
            throw new Error(timeoutConstants.timeoutMessage);
        }, issueContext(displayWorker, eventStream));

        assert.exists(eventStream.events.find(event => event instanceof DotnetCommandFailed));
    });
});
