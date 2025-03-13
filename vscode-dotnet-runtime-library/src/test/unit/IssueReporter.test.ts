/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { AcquireErrorConfiguration } from '../../Utils/ErrorHandler';
import { formatIssueUrl } from '../../Utils/IssueReporter';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockExtensionConfigurationWorker } from '../mocks/MockExtensionConfigurationWorker';
import { MockEventStream, MockLoggingObserver } from '../mocks/MockObjects';
import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';
const assert = chai.assert;

suite('IssueReporter Unit Tests', function ()
{
    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('Issue url is properly formed', async () =>
    {
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
        for (const expected of expectedBodyContent)
        {
            assert.include(issueBody, expected);
        }

        const expectedUrlContent = ['new', 'vscode-dotnet-runtime', 'issues'];
        for (const expected of expectedUrlContent)
        {
            assert.include(url, expected);
        }
    });
});
