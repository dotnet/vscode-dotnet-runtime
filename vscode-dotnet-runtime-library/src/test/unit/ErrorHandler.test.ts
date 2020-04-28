/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import { AcquireErrorConfiguration, errorConstants, timeoutConstants, UninstallErrorConfiguration } from '../../Utils/ErrorConstants';
import { callWithErrorHandling } from '../../Utils/ErrorHandler';
import { IIssueContext } from '../../Utils/IIssueContext';
import { MockLoggingObserver } from '../mocks/MockObjects';
import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';
const assert = chai.assert;

suite('ErrorHandler Unit Tests', () => {
    const issueContext = (displayWorker: MockWindowDisplayWorker) => {
        return {
            logger: new MockLoggingObserver(),
            errorConfiguration: UninstallErrorConfiguration.DisplayAllErrorPopups,
            displayWorker,
        } as IIssueContext;
    };

    test('No error popup is displayed when there is no error', async () => {
        const displayWorker = new MockWindowDisplayWorker();
        const res = await callWithErrorHandling<string>(() => {
            return '';
        }, issueContext(displayWorker));

        assert.equal(displayWorker.errorMessage, '');
        assert.equal(displayWorker.clipboardText, '');
    });

    test('Error popup appears on error', async () => {
        const errorString = 'Fake error message';
        const displayWorker = new MockWindowDisplayWorker();
        const res = await callWithErrorHandling<string>(() => {
            displayWorker.copyToUserClipboard(errorString);
            throw new Error(errorString);
        }, issueContext(displayWorker));

        assert.include(displayWorker.errorMessage, errorString);
        assert.include(displayWorker.clipboardText, errorString);
        assert.includeMembers(displayWorker.options, [errorConstants.reportOption, errorConstants.hideOption]);
    });

    test('Timeout popup appears on timeout', async () => {
        const displayWorker = new MockWindowDisplayWorker();
        const res = await callWithErrorHandling<string>(() => {
            throw new Error(timeoutConstants.timeoutMessage);
        }, issueContext(displayWorker));

        assert.include(displayWorker.errorMessage, timeoutConstants.timeoutMessage);
        assert.equal(displayWorker.clipboardText, '');
        assert.includeMembers(displayWorker.options, [timeoutConstants.moreInfoOption]);
    });
});
