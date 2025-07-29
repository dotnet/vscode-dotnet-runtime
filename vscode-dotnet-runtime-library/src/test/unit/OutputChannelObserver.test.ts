/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { DotnetInstall } from '../../Acquisition/DotnetInstall';
import { DotnetAcquisitionCompleted, DotnetAcquisitionStarted, DotnetExistingPathResolutionCompleted, DotnetFileIntegrityFailureEvent, DotnetOfflineWarning } from '../../EventStream/EventStreamEvents';
import { OutputChannelObserver } from '../../EventStream/OutputChannelObserver';
import { MockOutputChannel } from '../mocks/MockOutputChannel';

const assert = chai.assert;
const defaultTimeoutTime = 5000;

suite('OutputChannelObserver Unit Tests', function ()
{
    const mockInstall: DotnetInstall = {
        version: '8.0',
        isGlobal: false,
        architecture: 'x64',
        installId: '8.0~x64',
        installMode: 'runtime'
    };

    test('It suppresses output when suppressOutput is true', async () =>
    {
        const mockOutputChannel = new MockOutputChannel();
        const observer = new OutputChannelObserver(mockOutputChannel, true);

        // Test various event types that normally produce output
        const acquisitionStartedEvent = new DotnetAcquisitionStarted(mockInstall, 'test-extension');
        const acquisitionCompletedEvent = new DotnetAcquisitionCompleted(mockInstall, '/path/to/dotnet', 'test-extension');
        const warningEvent = new DotnetFileIntegrityFailureEvent('Test warning message');

        // Post events to the observer
        observer.post(acquisitionStartedEvent);
        observer.post(acquisitionCompletedEvent);
        observer.post(warningEvent);

        // Verify no output was written when suppressOutput is true
        assert.isEmpty(mockOutputChannel.appendedText, 'No output should be written when suppressOutput is true');
    }).timeout(defaultTimeoutTime);

    test('It produces output when suppressOutput is false', async () =>
    {
        const mockOutputChannel = new MockOutputChannel();
        const observer = new OutputChannelObserver(mockOutputChannel, false);

        // Test with an event that produces output
        const acquisitionStartedEvent = new DotnetOfflineWarning('Test offline warning message');
        observer.post(acquisitionStartedEvent);

        // Verify output was written when suppressOutput is false
        assert.isNotEmpty(mockOutputChannel.appendedText, 'Output should be written when suppressOutput is false');
    }).timeout(defaultTimeoutTime);

    test('It produces output when suppressOutput is not specified (default behavior)', async () =>
    {
        const mockOutputChannel = new MockOutputChannel();
        const observer = new OutputChannelObserver(mockOutputChannel); // No suppressOutput parameter

        // Test with an event that produces output
        const warningEvent = new DotnetFileIntegrityFailureEvent('Test warning message');
        observer.post(warningEvent);

        // Verify output was written with default behavior
        assert.isNotEmpty(mockOutputChannel.appendedText, 'Output should be written with default behavior');
        assert.include(mockOutputChannel.appendedText, 'Test warning message', 'The warning message should be in the output');
    }).timeout(defaultTimeoutTime);

    test('It handles verbose-only events based on highVerbosity setting', async () =>
    {
        const mockOutputChannel1 = new MockOutputChannel();
        const mockOutputChannel2 = new MockOutputChannel();
        const observerVerbose = new OutputChannelObserver(mockOutputChannel1, false, true);
        const observerNonVerbose = new OutputChannelObserver(mockOutputChannel2, false, false);

        const verboseEvent = new DotnetExistingPathResolutionCompleted(`Path`);

        observerVerbose.post(verboseEvent);
        observerNonVerbose.post(verboseEvent);

        assert.include(mockOutputChannel1.appendedText, 'path', 'Verbose-only events should display when highVerbosity is true');
        assert.notInclude(mockOutputChannel2.appendedText, 'path', 'Verbose-only events should not display when highVerbosity is false');
    }).timeout(defaultTimeoutTime);
});