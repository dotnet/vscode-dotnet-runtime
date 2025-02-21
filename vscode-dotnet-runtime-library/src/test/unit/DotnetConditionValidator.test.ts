/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as lodash from 'lodash';
import { MockCommandExecutor } from '../mocks/MockObjects';
import { DotnetConditionValidator } from '../../Acquisition/DotnetConditionValidator';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
import { IDotnetFindPathContext } from '../../IDotnetFindPathContext';
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
const executionResultWithListRuntimesResultWithPreviewOnly = { status: '', stdout: listRuntimesResultWithEightPreviewOnly, stderr: '' };
const executionResultWithListRuntimesResultWithFullOnly = { status: '', stdout: listRuntimesResultWithEightFull, stderr: '' };

const executionResultWithListSDKsResultWithPreviewOnly = { status: '', stdout: listSDKsResultWithEightPreviewOnly, stderr: '' };
const executionResultWithListSDKsResultFullSDK = { status: '', stdout: listSDKsResultWithEightFull, stderr: '' };

suite('DotnetConditionValidator Unit Tests', () =>
{
    const utilityContext = getMockUtilityContext();
    const acquisitionContext = getMockAcquisitionContext('runtime', '8.0');
    const mockExecutor = new MockCommandExecutor(acquisitionContext, utilityContext);

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

    test('It does not take newer major SDK if latestPatch or feature used', async () =>
    {
        const conditionValidator = new DotnetConditionValidator(acquisitionContext, utilityContext, mockExecutor);
        const contextThatCanBeIgnoredExceptMode = lodash.cloneDeep(acquisitionContext.acquisitionContext);
        contextThatCanBeIgnoredExceptMode.mode = 'sdk';

        let isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.100', '8.0.201', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestPatch' });
        assert.isNotTrue(isAccepted, 'It doesnt take 9.0 sdk for 8.0 latestPatch');

        isAccepted = conditionValidator.stringVersionMeetsRequirement('9.0.100', '8.0.201', { acquireContext: contextThatCanBeIgnoredExceptMode, versionSpecRequirement: 'latestFeature' });
        assert.isNotTrue(isAccepted, 'It doesnt take 9.0 sdk for 8.0 latestFeature');

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
});
