/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import { formatIssueUrl } from '../../Utils/IssueReporter';
import { MockLoggingObserver } from '../mocks/MockObjects';
const assert = chai.assert;

suite('IssueReporter Unit Tests', () => {
    test('Issue url is properly formed', async () => {
        const [url, issueBody] = formatIssueUrl(new Error(), { logger: new MockLoggingObserver() });

        const expectedBodyContent = ['Mock file location'];
        for (const expected of expectedBodyContent) {
            assert.include(issueBody, expected);
        }

        const expectedUrlContent = ['The issue text was copied to the clipboard'].map((s) => encodeURIComponent(s));
        for (const expected of expectedUrlContent) {
            assert.include(url, expected);
        }
    });
});
