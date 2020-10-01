/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import { DotnetCommandFailed, DotnetCommandSucceeded } from '../../EventStream/EventStreamEvents';
import { ExistingPathKeys } from '../../IExtensionContext';
import {
    errorConstants,
    timeoutConstants,
    UninstallErrorConfiguration,
} from '../../Utils/ErrorHandler';
import { callWithErrorHandling } from '../../Utils/ErrorHandler';
import { IIssueContext } from '../../Utils/IIssueContext';
import { MockExtensionConfigurationWorker } from '../mocks/MockExtensionConfigurationWorker';
import { MockEventStream, MockLoggingObserver } from '../mocks/MockObjects';
import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';
const assert = chai.assert;

suite('ErrorHandler Unit Tests', () => {
    const issueContext = (displayWorker: MockWindowDisplayWorker, eventStream: MockEventStream) => {
        return {
            logger: new MockLoggingObserver(),
            errorConfiguration: UninstallErrorConfiguration.DisplayAllErrorPopups,
            displayWorker,
            extensionConfigWorker: new MockExtensionConfigurationWorker(),
            eventStream,
            commandName: 'test',
            version: 'testVersion',
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
        }, issueContext(displayWorker, new MockEventStream()), 'MockId');

        assert.include(displayWorker.errorMessage, errorString);
        assert.include(displayWorker.errorMessage, 'testVersion');
        assert.include(displayWorker.clipboardText, errorString);
        assert.includeMembers(displayWorker.options,
            [errorConstants.reportOption, errorConstants.hideOption, errorConstants.moreInfoOption, errorConstants.configureManuallyOption]);
    });

    test('Path can be manually configured via popup', async () => {
        const mockExtensionId = 'MockId';
        const displayWorker = new MockWindowDisplayWorker(__dirname);
        const context = issueContext(displayWorker, new MockEventStream());
        const res = await callWithErrorHandling<string>(() => {
            throw new Error('errorString');
        }, context, mockExtensionId);

        // Mock the user clicking 'Configure manually'
        assert.isDefined(displayWorker.callback);
        await displayWorker.callback!('Configure manually');
        assert.include(displayWorker.infoMessage, `Set .NET path to ${__dirname}.`);
        const configResult = context.extensionConfigWorker.getPathConfigurationValue();
        assert.isDefined(configResult);
        const expectedConfig = [{ [ExistingPathKeys.extensionIdKey]: mockExtensionId, [ExistingPathKeys.pathKey] : __dirname },
                              { [ExistingPathKeys.extensionIdKey]: 'MockRequestingExtensionId', [ExistingPathKeys.pathKey] : 'MockPath' }];
        assert.deepEqual(configResult!, expectedConfig);
    });

    test('Warning popup appears on invalid manually configured path', async () => {
        const displayWorker = new MockWindowDisplayWorker();
        const res = await callWithErrorHandling<string>(() => {
            throw new Error('errorString');
        }, issueContext(displayWorker, new MockEventStream()), 'MockId');

        // Mock the user clicking 'Configure manually'
        assert.isDefined(displayWorker.callback);
        await displayWorker.callback!('Configure manually');
        assert.equal(displayWorker.warningMessage, 'Manually configured path was not valid.');
    });

    test('Timeout popup appears on timeout', async () => {
        const displayWorker = new MockWindowDisplayWorker();
        const res = await callWithErrorHandling<string>(() => {
            throw new Error(timeoutConstants.timeoutMessage);
        }, issueContext(displayWorker, new MockEventStream()));

        assert.include(displayWorker.errorMessage, timeoutConstants.timeoutMessage);
        assert.include(displayWorker.errorMessage, 'testVersion');
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
