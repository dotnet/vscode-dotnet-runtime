/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { GetDotnetInstallInfo } from '../../Acquisition/DotnetInstall';
import { DotnetInstallMode } from '../../Acquisition/DotnetInstallMode';
import
{
    DotnetAcquisitionFinalError,
    DotnetAcquisitionRequested,
    DotnetAcquisitionStarted,
    DotnetAcquisitionTotalSuccessEvent,
} from '../../EventStream/EventStreamEvents';
import { ModalEventRepublisher } from '../../EventStream/ModalEventPublisher';
import { MockEventStream } from '../mocks/MockObjects';

const assert = chai.assert;

suite('ModalEventRepublisher Unit Tests', function ()
{
    const expectedNames = {
        sdk: {
            requested: 'DotnetGlobalSDKAcquisitionRequested',
            started: 'DotnetGlobalSDKAcquisitionStarted',
            success: 'DotnetGlobalSDKAcquisitionTotalSuccessEvent',
            error: 'DotnetGlobalSDKAcquisitionError',
        },
        runtime: {
            requested: 'DotnetGlobalRuntimeAcquisitionRequested',
            started: 'DotnetGlobalRuntimeAcquisitionStarted',
            success: 'DotnetGlobalRuntimeAcquisitionTotalSuccessEvent',
            error: 'DotnetGlobalRuntimeAcquisitionError',
        },
        aspnetcore: {
            requested: 'DotnetGlobalASPNetRuntimeAcquisitionRequested',
            started: 'DotnetGlobalASPNetRuntimeAcquisitionStarted',
            success: 'DotnetGlobalASPNetRuntimeAcquisitionTotalSuccessEvent',
            error: 'DotnetGlobalASPNetRuntimeAcquisitionError',
        },
    };

    function assertRepublishedEvent(event: DotnetAcquisitionRequested | DotnetAcquisitionStarted | DotnetAcquisitionTotalSuccessEvent | DotnetAcquisitionFinalError, expectedName: string): void
    {
        const eventStream = new MockEventStream();
        new ModalEventRepublisher(eventStream).post(event);

        assert.lengthOf(eventStream.events, 1);
        assert.equal(eventStream.events[0].eventName, expectedName);
    }

    for (const mode of ['sdk', 'runtime', 'aspnetcore'] as DotnetInstallMode[])
    {
        test(`It republishes global ${mode} modal events with product-specific names`, () =>
        {
            const install = GetDotnetInstallInfo('10.0.3', mode, 'global', 'x64');
            const expected = expectedNames[mode];

            assertRepublishedEvent(new DotnetAcquisitionRequested('10.0.3', 'test.extension', mode, 'global'), expected.requested);
            assertRepublishedEvent(new DotnetAcquisitionStarted(install, '10.0.3', 'test.extension'), expected.started);
            assertRepublishedEvent(new DotnetAcquisitionTotalSuccessEvent('10.0.3', install, 'test.extension', 'dotnet'), expected.success);
            assertRepublishedEvent(new DotnetAcquisitionFinalError(new Error('failure'), 'OriginalFailure', install), expected.error);
        });
    }
});