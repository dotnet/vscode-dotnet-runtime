/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import { AcquireErrorConfiguration } from '../../Utils/ErrorHandler';
import { formatIssueUrl } from '../../Utils/IssueReporter';
import { MockEventStream, MockLoggingObserver } from '../mocks/MockObjects';
import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';
const assert = chai.assert;

suite('IssueReporter Unit Tests', () => {
    test('Issue url is properly formed', async () => {
        const [url, issueBody] = formatIssueUrl(
            new Error(),
            {
                logger: new MockLoggingObserver(),
                errorConfiguration: AcquireErrorConfiguration.DisableErrorPopups,
                displayWorker: new MockWindowDisplayWorker(),
                commandName: 'test',
                eventStream: new MockEventStream(),
            });

        const expectedBodyContent = ['Error', 'Repro steps'];
        for (const expected of expectedBodyContent) {
            assert.include(issueBody, expected);
        }

        const expectedUrlContent = ['The issue text was copied to the clipboard', 'Privacy Alert', 'Mock file location'].map((s) => encodeURIComponent(s));
        for (const expected of expectedUrlContent) {
            assert.include(url, expected);
        }
    });
});
