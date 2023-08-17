/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import { AcquireErrorConfiguration } from '../../Utils/ErrorHandler';
import { formatIssueUrl } from '../../Utils/IssueReporter';
import { MockExtensionConfigurationWorker } from '../mocks/MockExtensionConfigurationWorker';
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
                extensionConfigWorker: new MockExtensionConfigurationWorker(),
                commandName: 'test',
                eventStream: new MockEventStream(),
                version: '',
                moreInfoUrl: '',
                timeoutInfoUrl: '',
            });

        const expectedBodyContent = ['log', 'private'];
        for (const expected of expectedBodyContent) {
            assert.include(issueBody, expected);
        }

        const expectedUrlContent = ['new', 'vscode-dotnet-runtime', 'issues'];
        for (const expected of expectedUrlContent) {
            assert.include(url, expected);
        }
    });
});
