/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { DotnetResolver } from '../../Acquisition/DotnetResolver';
import { CommandExecutionEvent } from '../../EventStream/EventStreamEvents';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor, MockEventStream, MockExtensionContext, MockInstallTracker } from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
const assert = chai.assert;

const defaultTimeoutTimeMs = 25000;

suite('DotnetResolver Unit Tests', function ()
{
    const utilityContext = getMockUtilityContext();
    const acquisitionContext = getMockAcquisitionContext('runtime', '8.0');

    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
        const trackerSingletonMockAccess = new MockInstallTracker(new MockEventStream(), new MockExtensionContext());
        trackerSingletonMockAccess.endAnySingletonTrackingSessions();
    });

    function makeResolverWithMockExecutorAndEventStream()
    {
        const mockEventStream = new MockEventStream();
        const acquisitionContextWithEventStream = {
            ...acquisitionContext,
            eventStream: mockEventStream
        };
        const mockExecutorWithEventStream = new MockCommandExecutor(acquisitionContextWithEventStream, utilityContext);
        const resolver = new DotnetResolver(acquisitionContextWithEventStream, utilityContext, mockExecutorWithEventStream);
        return { validator: resolver, mockEventStream, mockExecutorWithEventStream };
    }

    test('getSDKs and getRuntimes do not call dotnet --info if --arch is supported', async () =>
    {
        const { validator, mockEventStream, mockExecutorWithEventStream } = makeResolverWithMockExecutorAndEventStream();

        mockExecutorWithEventStream.otherCommandPatternsToMock = [
            '--list-sdks --arch arm64',
            '--list-runtimes --arch arm64',
            '--list-runtimes --arch invalid-arch',
            '--info',
            '--list-runtimes --arch x64',
        ];
        mockExecutorWithEventStream.otherCommandsReturnValues = [
            { status: '0', stdout: "10.0.100 [C:\\Program Files\\dotnet]", stderr: '' }, // --list-sdks
            { status: '0', stdout: "Microsoft.NETCore.App 10.0.1 [C:\\dotnet\\shared\\Microsoft.NETCore.App]", stderr: '' }, // --list-runtimes
            { status: '1', stdout: '', stderr: 'error: unrecognized architecture' }, // --list-runtimes --arch invalid-arch
            { status: '0', stdout: 'Architecture: arm64', stderr: '' }, // --info
            { status: '0', stdout: '', stderr: '' } // --list-runtimes x64 - make it return something so we check that it can work with other arch
        ];

        const sdks = await validator.getDotnetInstalls('foobar', 'sdk', 'arm64');
        const runtimes = await validator.getDotnetInstalls('foobar', 'runtime', 'arm64');

        const infoEvents = mockEventStream.events.filter(e => e instanceof CommandExecutionEvent && e.eventMessage && e.eventMessage.includes('--info'));
        assert.lengthOf(infoEvents, 0, 'dotnet --info should not be called if --arch is supported');

        // info will get called by this since there is no version to validate if --arch is supported
        const x64Runtimes = await validator.getDotnetInstalls('foobar', 'runtime', 'x64');
        assert.lengthOf(x64Runtimes, 0, 'No x64 runtimes should be returned when requesting arm64 runtimes, when only x64 exists on disk');

        // Check architecture was set correctly
        assert.strictEqual(sdks?.[0].architecture, 'arm64', 'Resolved SDK architecture should match requested architecture');
        assert.strictEqual(runtimes?.[0].architecture, 'arm64', 'Resolved Runtime architecture should match requested architecture');
    }).timeout(defaultTimeoutTimeMs);

    test('getSDKs and getRuntimes call dotnet --info if --arch is not supported', async () =>
    {
        const { validator, mockEventStream, mockExecutorWithEventStream } = makeResolverWithMockExecutorAndEventStream();

        mockExecutorWithEventStream.otherCommandPatternsToMock = [
            '--list-sdks',
            '--list-runtimes --arch x64',
            '--list-runtimes --arch arm64',
            '--list-runtimes --arch invalid-arch',
            '--info'
        ];
        mockExecutorWithEventStream.otherCommandsReturnValues = [
            { status: '0', stdout: "9.0.100 [C:\\Program Files\\dotnet\\sdk]", stderr: '' }, // --list-sdks
            { status: '0', stdout: "Microsoft.NETCore.App 9.0.1 [C:\\Program Files\\Microsoft.NETCore.App]", stderr: '' }, // --list-runtimes
            { status: '0', stdout: "Microsoft.NETCore.App 9.0.1 [C:\\Program Files\\Microsoft.NETCore.App]", stderr: '' }, // --list-runtimes
            { status: '0', stdout: "Microsoft.NETCore.App 9.0.1 [C:\\Program Files\\Microsoft.NETCore.App]", stderr: '' }, // --list-runtimes --arch invalid - passes and ignores flag if not supported
            { status: '0', stdout: 'Architecture: x64', stderr: '' } // --info
        ];

        (validator as any).hostSupportsArchFlag = async () => false;

        const runtimes = await validator.getDotnetInstalls('foobar', 'runtime', 'x64');
        const sdks = await validator.getDotnetInstalls('foobar', 'sdk', 'x64');
        const armSdks = await validator.getDotnetInstalls('foobar', 'sdk', 'arm64');


        const infoEvents = mockEventStream.events.filter(e => e instanceof CommandExecutionEvent && e.eventMessage && e.eventMessage.includes('--info'));
        assert.isAbove(infoEvents.length, 0, 'dotnet --info should be called if --arch is not supported');

        // Check architecture was set to null
        assert.equal(runtimes?.at(0)?.architecture, 'x64', 'Resolved SDKs should find architecture from --info');
        assert.equal(sdks?.at(0)?.architecture, 'x64', 'Resolved Runtimes should find architecture from --info');
        assert.equal(armSdks.length, 0, 'an arm sdk is not reported when info and dotnet output is only x64');
    }).timeout(defaultTimeoutTimeMs);

    test('Windows Desktop Runtime is not included in runtime discovery results', async () =>
    {
        const { validator, mockEventStream, mockExecutorWithEventStream } = makeResolverWithMockExecutorAndEventStream();

        mockExecutorWithEventStream.otherCommandPatternsToMock = [
            '--list-runtimes --arch x64',
        ];
        mockExecutorWithEventStream.otherCommandsReturnValues = [
            {
                status: '0',
                stdout: "Microsoft.NETCore.App 8.0.1 [C:\\dotnet\\shared\\Microsoft.NETCore.App]\nMicrosoft.AspNetCore.App 8.0.1 [C:\\dotnet\\shared\\Microsoft.AspNetCore.App]\nMicrosoft.WindowsDesktop.App 8.0.1 [C:\\dotnet\\shared\\Microsoft.WindowsDesktop.App]",
                stderr: ''
            },
        ];

        const runtimes = await validator.getRuntimes('dotnet', 'x64');

        // Should only return NETCore.App and AspNetCore.App, but not WindowsDesktop.App
        assert.lengthOf(runtimes, 2, 'Should return exactly 2 runtimes (NETCore and AspNetCore)');

        const runtimeTypes = runtimes.map(r => r.mode);
        assert.include(runtimeTypes, 'runtime', 'Should include Microsoft.NETCore.App as runtime');
        assert.notInclude(runtimeTypes, 'sdk', 'Should not include Windows Desktop Runtime (mapped to sdk placeholder)');
    }).timeout(defaultTimeoutTimeMs);
});
