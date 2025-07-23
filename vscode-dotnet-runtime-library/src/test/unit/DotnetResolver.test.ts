/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as os from 'os';
import { DotnetResolver } from '../../Acquisition/DotnetResolver';
import { CommandExecutionEvent } from '../../EventStream/EventStreamEvents';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor, MockEventStream } from '../mocks/MockObjects';
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
    });

    function makeResolverWithMockExecutorAndEventStream()
    {
        const mockEventStream = new MockEventStream();
        const acquisitionContextWithEventStream = {
            ...acquisitionContext,
            eventStream: mockEventStream
        };
        const mockExecutorWithEventStream = new MockCommandExecutor(acquisitionContextWithEventStream, utilityContext);
        const validator = new DotnetResolver(acquisitionContextWithEventStream, utilityContext, mockExecutorWithEventStream);
        return { validator, mockEventStream, mockExecutorWithEventStream };
    }

    test('getSDKs and getRuntimes do not call dotnet --info if --arch is supported', async () =>
    {
        const { validator, mockEventStream, mockExecutorWithEventStream } = makeResolverWithMockExecutorAndEventStream();

        mockExecutorWithEventStream.otherCommandPatternsToMock = [
            '--list-sdks --arch arm64',
            '--list-runtimes --arch arm64',
            '--list-runtimes --arch invalid-arch',
            '--info'
        ];
        mockExecutorWithEventStream.otherCommandsReturnValues = [
            { status: '0', stdout: "10.0.100 [C:\\Program Files\\dotnet\\sdk]", stderr: '' }, // --list-sdks
            { status: '0', stdout: "Microsoft.NETCore.App 10.0.1 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]", stderr: '' }, // --list-runtimes
            { status: '1', stdout: '', stderr: 'error: unrecognized architecture' }, // --list-runtimes --arch invalid-arch
            { status: '0', stdout: 'Architecture: arm64', stderr: '' } // --info
        ];

        const sdks = await validator.getSDKs('dotnet', 'arm64', false);
        const runtimes = await validator.getRuntimes('dotnet', 'arm64', false);

        const infoEvents = mockEventStream.events.filter(e => e instanceof CommandExecutionEvent && e.eventMessage && e.eventMessage.includes('--info'));
        assert.lengthOf(infoEvents, 0, 'dotnet --info should not be called if --arch is supported');

        // Check architecture was set correctly
        assert.strictEqual(sdks[0].architecture, 'arm64', 'SDK architecture should be set to requested architecture');
        assert.strictEqual(runtimes[0].architecture, 'arm64', 'Runtime architecture should be set to requested architecture');
    }).timeout(defaultTimeoutTimeMs);

    test('getSDKs and getRuntimes call dotnet --info if --arch is not supported', async () =>
    {
        const { validator, mockEventStream, mockExecutorWithEventStream } = makeResolverWithMockExecutorAndEventStream();

        mockExecutorWithEventStream.otherCommandPatternsToMock = [
            '--list-sdks',
            '--list-runtimes',
            '--list-runtimes --arch invalid-arch',
            '--info'
        ];
        mockExecutorWithEventStream.otherCommandsReturnValues = [
            { status: '0', stdout: "9.0.100 [C:\\Program Files\\dotnet\\sdk]", stderr: '' }, // --list-sdks
            { status: '0', stdout: "Microsoft.NETCore.App 9.0.1 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]", stderr: '' }, // --list-runtimes
            { status: '0', stdout: 'Microsoft.NETCore.App 9.0.1 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]', stderr: '' }, // --list-runtimes --arch invalid-arch
            { status: '0', stdout: 'Architecture: x64', stderr: '' } // --info
        ];

        (validator as any).hostSupportsArchFlag = async () => false;

        const sdks = await validator.getSDKs('dotnet', 'arm64', false);
        const runtimes = await validator.getRuntimes('dotnet', 'arm64', false);
        const infoEvents = mockEventStream.events.filter(e => e instanceof CommandExecutionEvent && e.eventMessage && e.eventMessage.includes('--info'));
        assert.isAbove(infoEvents.length, 0, 'dotnet --info should be called if --arch is not supported');

        // Check architecture was set to null
        assert.isNull(sdks[0].architecture, 'SDK architecture should be null when host does not support --arch');
        assert.isNull(runtimes[0].architecture, 'Runtime architecture should be null when host does not support --arch');
    }).timeout(defaultTimeoutTimeMs);

    test('dotnet --info is called if .NET 10 is detected but invalid arch returns status 0', async () =>
    {
        const { validator, mockEventStream, mockExecutorWithEventStream } = makeResolverWithMockExecutorAndEventStream();

        mockExecutorWithEventStream.otherCommandPatternsToMock = [
            '--list-sdks',
            '--list-runtimes --arch invalid-arch',
            '--info'
        ];
        mockExecutorWithEventStream.otherCommandsReturnValues = [
            { status: '0', stdout: "10.0.100 [C:\\Program Files\\dotnet\\sdk]", stderr: '' }, // --list-sdks
            { status: '0', stdout: 'Microsoft.NETCore.App 10.0.1 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]', stderr: '' }, // --list-runtimes --arch invalid-arch
            { status: '0', stdout: 'Architecture: x64', stderr: '' } // --info
        ];

        const sdks = await validator.getSDKs('dotnet', 'arm64', false);
        const infoEvents = mockEventStream.events.filter(e => e instanceof CommandExecutionEvent && e.eventMessage && e.eventMessage.includes('--info'));
        assert.isAbove(infoEvents.length, 0, 'dotnet --info should be called if --arch returns status 0 even with .NET 10');

        // Check architecture was set to null
        assert.isNull(sdks[0].architecture, 'Architecture should be null when --arch is not supported');
    }).timeout(defaultTimeoutTimeMs);

    test('It does not call info or list-runtimes for known architectures', async () =>
    {
        const { validator, mockEventStream, mockExecutorWithEventStream } = makeResolverWithMockExecutorAndEventStream();

        mockExecutorWithEventStream.otherCommandPatternsToMock = [
            '--list-sdks',
            '--list-runtimes --arch invalid-arch',
            '--info'
        ];
        mockExecutorWithEventStream.otherCommandsReturnValues = [
            { status: '0', stdout: "10.0.100 [C:\\Program Files\\dotnet\\sdk]", stderr: '' }, // --list-sdks
            { status: '0', stdout: 'Microsoft.NETCore.App 10.0.1 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]', stderr: '' }, // --list-runtimes --arch invalid-arch
            { status: '0', stdout: 'Architecture: x64', stderr: '' } // --info
        ];
        // Test runtimes with knownArchitecture = true
        await validator.getRuntimes('dotnet', os.arch(), true);

        // Test SDKs with knownArchitecture = true
        await validator.getSDKs('dotnet', os.arch(), true);

        // Verify that no commands were executed with --list-runtimes or --info
        const executedCommands = mockEventStream.events
            .filter(event => event instanceof CommandExecutionEvent);

        assert.isFalse(
            executedCommands.some(cmd => cmd.eventMessage.includes('--info')),
            'It should not execute --info command when architecture is known'
        );

        assert.isFalse(
            executedCommands.some(cmd => cmd.eventMessage.includes('invalid-arch')),
            'It should not execute commands with invalid-arch when architecture is known'
        );
    });
});
