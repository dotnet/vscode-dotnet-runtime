/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as lodash from 'lodash';
import { DotnetConditionValidator } from '../../Acquisition/DotnetConditionValidator';
import { DotnetInstallMode } from '../../Acquisition/DotnetInstallMode';
import { DotnetVersionSpecRequirement } from '../../DotnetVersionSpecRequirement';
import { CommandExecutionEvent } from '../../EventStream/EventStreamEvents';
import { IDotnetFindPathContext } from '../../IDotnetFindPathContext';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor, MockEventStream } from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
const assert = chai.assert;

const listRuntimesResultWithEightPreviewOnly = `
Microsoft.NETCore.App 8.0.0-alpha.2.24522.8 [C:\\Program Files\\dotnet\\shared\\Microsoft.AspNetCore.App]
Microsoft.AspNetCore.App 9.0.0-rc.2.24474.3 [C:\\Program Files\\dotnet\\shared\\Microsoft.AspNetCore.App]

`;

const listSDKsResultWithEightPreviewOnly = `
8.0.100-rc.2.24474.11 [C:\\Program Files\\dotnet\\sdk]
`;

const listRuntimesResultWithEightFull = `
${listRuntimesResultWithEightPreviewOnly}
Microsoft.NETCore.App 8.0.7 [C:\\Program Files\\dotnet\\shared\\Microsoft.AspNetCore.App]
`

const listSDKsResultWithEightFull = `
${listSDKsResultWithEightPreviewOnly}
8.0.101 [C:\\Program Files\\dotnet\\sdk]
`
const executionResultWithListRuntimesResultWithPreviewOnly = { status: '0', stdout: listRuntimesResultWithEightPreviewOnly, stderr: '' };
const executionResultWithListRuntimesResultWithFullOnly = { status: '0', stdout: listRuntimesResultWithEightFull, stderr: '' };

const executionResultWithListSDKsResultWithPreviewOnly = { status: '0', stdout: listSDKsResultWithEightPreviewOnly, stderr: '' };
const executionResultWithListSDKsResultFullSDK = { status: '0', stdout: listSDKsResultWithEightFull, stderr: '' };

const defaultTimeoutTimeMs = 25000;

suite('DotnetConditionValidator Unit Tests', function ()
{
    const utilityContext = getMockUtilityContext();
    const acquisitionContext = getMockAcquisitionContext('runtime', '8.0');
    const mockExecutor = new MockCommandExecutor(acquisitionContext, utilityContext);

    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('It respects the skip preview flag correctly', async () =>
    {
        const requirementWithRejectPreviews = {
            acquireContext: acquisitionContext.acquisitionContext,
            versionSpecRequirement: 'greater_than_or_equal',
            rejectPreviews: true
        } as IDotnetFindPathContext

        const requirementAllowingPreviews = lodash.cloneDeep(requirementWithRejectPreviews);
        delete requirementAllowingPreviews.rejectPreviews;

        const requirementRejectingPreviewsSDKs = lodash.cloneDeep(requirementWithRejectPreviews);
        requirementRejectingPreviewsSDKs.acquireContext.mode = 'sdk';
        requirementRejectingPreviewsSDKs.acquireContext.version = '8.0'

        // Act as if only preview runtime and sdk installed
        mockExecutor.fakeReturnValue = executionResultWithListRuntimesResultWithPreviewOnly;
        mockExecutor.otherCommandPatternsToMock = ['--list-runtimes', '--list-sdks'];
        mockExecutor.otherCommandsReturnValues = [executionResultWithListRuntimesResultWithPreviewOnly, executionResultWithListSDKsResultWithPreviewOnly];

        const conditionValidator = new DotnetConditionValidator(acquisitionContext, utilityContext, mockExecutor);

        let meetsReq = await conditionValidator.dotnetMeetsRequirement('dotnet', requirementWithRejectPreviews);
        assert.isFalse(meetsReq, 'It rejects preview runtime if rejectPreviews set');
        meetsReq = await conditionValidator.dotnetMeetsRequirement('dotnet', requirementAllowingPreviews);
        assert.isTrue(meetsReq, 'It accepts preview runtime if rejectPreviews undefined');

        meetsReq = await conditionValidator.dotnetMeetsRequirement('dotnet', requirementRejectingPreviewsSDKs);
        assert.isFalse(meetsReq, 'It rejects preview SDK if rejectPreviews set');

        // Add a non preview runtime
        mockExecutor.otherCommandsReturnValues = [executionResultWithListRuntimesResultWithFullOnly, executionResultWithListSDKsResultWithPreviewOnly];

        meetsReq = await conditionValidator.dotnetMeetsRequirement('dotnet', requirementWithRejectPreviews);
        assert.isTrue(meetsReq, 'It finds non preview runtime if rejectPreviews set');

        meetsReq = await conditionValidator.dotnetMeetsRequirement('dotnet', requirementRejectingPreviewsSDKs);
        assert.isFalse(meetsReq, 'It rejects preview & full Runtime but only preview SDK looking for SDK if rejectPreviews set');

        // Add a non preview SDK
        mockExecutor.otherCommandsReturnValues = [executionResultWithListRuntimesResultWithFullOnly, executionResultWithListSDKsResultFullSDK];
        meetsReq = await conditionValidator.dotnetMeetsRequirement('dotnet', requirementRejectingPreviewsSDKs);
        assert.isTrue(meetsReq, 'It finds non preview SDK if rejectPreviews set');
    });

    test('It validates runtimes separately from sdks', async () =>
    {
        const runtime8_0_7Requirement = {
            acquireContext: getMockAcquisitionContext('runtime', '8.0.7').acquisitionContext,
            versionSpecRequirement: 'greater_than_or_equal'
        } as IDotnetFindPathContext

        mockExecutor.fakeReturnValue = executionResultWithListRuntimesResultWithFullOnly;
        mockExecutor.otherCommandPatternsToMock = ['--list-runtimes', '--list-sdks'];
        mockExecutor.otherCommandsReturnValues = [executionResultWithListRuntimesResultWithFullOnly, executionResultWithListSDKsResultWithPreviewOnly];

        const conditionValidator = new DotnetConditionValidator(acquisitionContext, utilityContext, mockExecutor);

        let meetsReq = await conditionValidator.dotnetMeetsRequirement('dotnet', runtime8_0_7Requirement);
        assert.isTrue(meetsReq, 'It finds the 8.0.7 runtime');

        const runtime8_0_8Requirement = {
            acquireContext: getMockAcquisitionContext('runtime', '8.0.8').acquisitionContext,
            versionSpecRequirement: 'greater_than_or_equal'
        } as IDotnetFindPathContext

        meetsReq = await conditionValidator.dotnetMeetsRequirement('dotnet', runtime8_0_8Requirement);
        assert.isFalse(meetsReq, 'It does not find the 8.0.8 runtime or treat the 8.0.101 SDK as a runtime');
    });

    test('It does not take newer major SDK if latestPatch or feature used', async () =>
    {
        const conditionValidator = new DotnetConditionValidator(acquisitionContext, utilityContext, mockExecutor);
        const contextThatCanBeIgnoredExceptMode = lodash.cloneDeep(acquisitionContext.acquisitionContext);
        contextThatCanBeIgnoredExceptMode.mode = 'sdk';

        let isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.100', '8.0.201', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestPatch' });
        assert.isNotTrue(isAccepted, 'It does not take 9.0 sdk for 8.0 latestPatch');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.100', '8.0.201', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestFeature' });
        assert.isNotTrue(isAccepted, 'It does not take 9.0 sdk for 8.0 latestFeature');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.100', '8.0.201', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestMajor' });
        assert.isTrue(isAccepted, 'It does take 9.0 sdk for 8.0 latestMajor');
    });

    test('It does not take newer major Runtime if latestPatch or feature used', async () =>
    {
        const conditionValidator = new DotnetConditionValidator(acquisitionContext, utilityContext, mockExecutor);
        const contextThatCanBeIgnoredExceptMode = lodash.cloneDeep(acquisitionContext.acquisitionContext);
        contextThatCanBeIgnoredExceptMode.mode = 'aspnetcore';

        let isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.2', '8.0.1', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestPatch' });
        assert.isNotTrue(isAccepted, 'It doesnt take 9.0 runtime for 8.0 latestPatch');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.2', '8.0.1', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestFeature' });
        assert.isNotTrue(isAccepted, 'It doesnt take 9.0 runtime for 8.0 latestFeature');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.2', '8.0.1', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestMajor' });
        assert.isTrue(isAccepted, 'It does take 9.0 runtime for 8.0 latestMajor');
    });

    test('It does not take latest SDK feature band on latestPatch', async () =>
    {
        const conditionValidator = new DotnetConditionValidator(acquisitionContext, utilityContext, mockExecutor);
        const contextThatCanBeIgnoredExceptMode = lodash.cloneDeep(acquisitionContext.acquisitionContext);
        contextThatCanBeIgnoredExceptMode.mode = 'sdk';

        let isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.200', '9.0.102', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestPatch' });
        assert.isNotTrue(isAccepted, 'It does not take latest feature band on latestPatch');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.200', '9.0.102', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestFeature' });
        assert.isTrue(isAccepted, 'It does take latest feature on latestFeature');
    });

    test('It does not take lower than patch on latestPatch or feature or band', async () =>
    {
        const conditionValidator = new DotnetConditionValidator(acquisitionContext, utilityContext, mockExecutor);
        const contextThatCanBeIgnoredExceptMode = lodash.cloneDeep(acquisitionContext.acquisitionContext);
        contextThatCanBeIgnoredExceptMode.mode = 'sdk';

        let isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.201', '9.0.202', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestFeature' });
        assert.isNotTrue(isAccepted, 'It does not take old sdk on latestFeature');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.201', '9.0.202', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestPatch' });
        assert.isNotTrue(isAccepted, 'It does not take old sdk on latestPatch');
    });

    test('latestPatch and latestFeature work on runtime search', async () =>
    {
        const conditionValidator = new DotnetConditionValidator(acquisitionContext, utilityContext, mockExecutor);
        const contextThatCanBeIgnoredExceptMode = lodash.cloneDeep(acquisitionContext.acquisitionContext);
        contextThatCanBeIgnoredExceptMode.mode = 'runtime';

        let isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.2', '9.0.1', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestPatch' });
        assert.isTrue(isAccepted, 'It does not fail with latestPatch on runtime');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.2', '9.0.1', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestFeature' });
        assert.isTrue(isAccepted, 'It does take latest runtime patch on latestFeature');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.2', '9.0.3', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestFeature' });
        assert.isNotTrue(isAccepted, 'It does not take old runtime on latestFeature');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.2', '9.0.3', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestPatch' });
        assert.isNotTrue(isAccepted, 'It does not take old runtime on latestPatch');
    });

    test('rollForward disable is equal to == on runtime', async () =>
    {
        const conditionValidator = new DotnetConditionValidator(acquisitionContext, utilityContext, mockExecutor);
        const contextThatCanBeIgnoredExceptMode = lodash.cloneDeep(acquisitionContext.acquisitionContext);
        contextThatCanBeIgnoredExceptMode.mode = 'aspnetcore';

        let isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.2', '9.0.1', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'disable' });
        assert.isNotTrue(isAccepted, 'disable does not allow upgrade');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.2', '9.0.3', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'disable' });
        assert.isNotTrue(isAccepted, 'disable does not allow downgrade');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('10.0.4', '9.0.3', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'disable' });
        assert.isNotTrue(isAccepted, 'disable does not allow major upgrade');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.1', '9.0.1', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'disable' });
        assert.isTrue(isAccepted, 'disable only takes the exact match runtime');
    });

    test('rollForward disable is equal to == on sdk', async () =>
    {
        const conditionValidator = new DotnetConditionValidator(acquisitionContext, utilityContext, mockExecutor);
        const contextThatCanBeIgnoredExceptMode = lodash.cloneDeep(acquisitionContext.acquisitionContext);
        contextThatCanBeIgnoredExceptMode.mode = 'sdk';

        let isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.102', '9.0.101', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'disable' });
        assert.isNotTrue(isAccepted, 'disable does not allow upgrade on sdk patch');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.201', '9.0.101', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'disable' });
        assert.isNotTrue(isAccepted, 'disable does not allow upgraded sdk band');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.201', '9.0.300', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'disable' });
        assert.isNotTrue(isAccepted, 'disable does not allow downgrade');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.1', '9.0.1', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'disable' });
        assert.isTrue(isAccepted, 'disable only takes the exact match sdk');
    });

    function makeValidatorWithMockExecutorAndEventStream()
    {
        const mockEventStream = new MockEventStream();
        const acquisitionContextWithEventStream = {
            ...acquisitionContext,
            eventStream: mockEventStream
        };
        const mockExecutorWithEventStream = new MockCommandExecutor(acquisitionContextWithEventStream, utilityContext);
        const validator = new DotnetConditionValidator(acquisitionContextWithEventStream, utilityContext, mockExecutorWithEventStream);
        return { validator, mockEventStream };
    }

    test('getSDKs and getRuntimes do not call dotnet --info if --arch is supported', async () =>
    {
        const { validator, mockEventStream } = makeValidatorWithMockExecutorAndEventStream();

        mockExecutor.otherCommandPatternsToMock = [
            '--list-sdks',
            '--list-runtimes',
            '--list-runtimes --arch invalid-arch',
            '--info'
        ];
        mockExecutor.otherCommandsReturnValues = [
            { status: '0', stdout: "10.0.100 [C:\\Program Files\\dotnet\\sdk]", stderr: '' }, // --list-sdks
            { status: '0', stdout: "Microsoft.NETCore.App 10.0.1 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]", stderr: '' }, // --list-runtimes
            { status: '1', stdout: '', stderr: 'error: unrecognized architecture' }, // --list-runtimes --arch invalid-arch
            { status: '0', stdout: 'Architecture: x64', stderr: '' } // --info
        ];

        (validator as any).hostSupportsArchFlag = async () => true;

        const sdks = await validator.getSDKs('dotnet', 'arm64');
        const runtimes = await validator.getRuntimes('dotnet', 'arm64');

        // Also test through dotnetMeetsRequirement
        const requirement = {
            acquireContext: {
                version: '10.0',
                architecture: 'arm64',
                requestingExtensionId: 'test',
                mode: 'sdk' as DotnetInstallMode
            },
            versionSpecRequirement: 'greater_than_or_equal' as DotnetVersionSpecRequirement
        };
        await validator.dotnetMeetsRequirement('dotnet', requirement);

        const infoEvents = mockEventStream.events.filter(e => e instanceof CommandExecutionEvent && e.eventMessage && e.eventMessage.includes('--info'));
        assert.lengthOf(infoEvents, 0, 'dotnet --info should not be called if --arch is supported');

        // Check architecture was set correctly
        assert.strictEqual(sdks[0].architecture, 'arm64', 'SDK architecture should be set to requested architecture');
        assert.strictEqual(runtimes[0].architecture, 'arm64', 'Runtime architecture should be set to requested architecture');
    }).timeout(defaultTimeoutTimeMs);

    test('getSDKs and getRuntimes call dotnet --info if --arch is not supported', async () =>
    {
        const { validator, mockEventStream } = makeValidatorWithMockExecutorAndEventStream();

        mockExecutor.otherCommandPatternsToMock = [
            '--list-sdks',
            '--list-runtimes',
            '--list-runtimes --arch invalid-arch',
            '--info'
        ];
        mockExecutor.otherCommandsReturnValues = [
            { status: '0', stdout: "9.0.100 [C:\\Program Files\\dotnet\\sdk]", stderr: '' }, // --list-sdks
            { status: '0', stdout: "Microsoft.NETCore.App 9.0.1 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]", stderr: '' }, // --list-runtimes
            { status: '0', stdout: 'Microsoft.NETCore.App 9.0.1 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]', stderr: '' }, // --list-runtimes --arch invalid-arch
            { status: '0', stdout: 'Architecture: x64', stderr: '' } // --info
        ];

        (validator as any).hostSupportsArchFlag = async () => false;

        const sdks = await validator.getSDKs('dotnet', 'arm64');
        const runtimes = await validator.getRuntimes('dotnet', 'arm64');

        // Also test through dotnetMeetsRequirement
        const requirement = {
            acquireContext: {
                version: '9.0',
                architecture: 'arm64',
                requestingExtensionId: 'test',
                mode: 'sdk' as DotnetInstallMode
            },
            versionSpecRequirement: 'greater_than_or_equal' as DotnetVersionSpecRequirement
        };
        await validator.dotnetMeetsRequirement('dotnet', requirement);

        const infoEvents = mockEventStream.events.filter(e => e instanceof CommandExecutionEvent && e.eventMessage && e.eventMessage.includes('--info'));
        assert.isAbove(infoEvents.length, 0, 'dotnet --info should be called if --arch is not supported');

        // Check architecture was set to null
        assert.isNull(sdks[0].architecture, 'SDK architecture should be null when host does not support --arch');
        assert.isNull(runtimes[0].architecture, 'Runtime architecture should be null when host does not support --arch');
    }).timeout(defaultTimeoutTimeMs);

    test('dotnet --info is called if .NET 10 is detected but invalid arch returns status 0', async () =>
    {
        const { validator, mockEventStream } = makeValidatorWithMockExecutorAndEventStream();

        mockExecutor.otherCommandPatternsToMock = [
            '--list-sdks',
            '--list-runtimes --arch invalid-arch',
            '--info'
        ];
        mockExecutor.otherCommandsReturnValues = [
            { status: '0', stdout: "10.0.100 [C:\\Program Files\\dotnet\\sdk]", stderr: '' }, // --list-sdks
            { status: '0', stdout: 'Microsoft.NETCore.App 10.0.1 [C:\\Program Files\\dotnet\\shared\\Microsoft.NETCore.App]', stderr: '' }, // --list-runtimes --arch invalid-arch
            { status: '0', stdout: 'Architecture: x64', stderr: '' } // --info
        ];

        const sdks = await validator.getSDKs('dotnet', 'arm64');

        // Also test through dotnetMeetsRequirement
        const requirement = {
            acquireContext: {
                version: '10.0',
                architecture: 'arm64',
                requestingExtensionId: 'test',
                mode: 'sdk' as DotnetInstallMode
            },
            versionSpecRequirement: 'greater_than_or_equal' as DotnetVersionSpecRequirement
        };
        await validator.dotnetMeetsRequirement('dotnet', requirement);

        const infoEvents = mockEventStream.events.filter(e => e instanceof CommandExecutionEvent && e.eventMessage && e.eventMessage.includes('--info'));
        assert.isAbove(infoEvents.length, 0, 'dotnet --info should be called if --arch returns status 0 even with .NET 10');

        // Check architecture was set to null
        assert.isNull(sdks[0].architecture, 'Architecture should be null when --arch is not supported');
    }).timeout(defaultTimeoutTimeMs);

});
