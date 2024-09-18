/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { MockCommandExecutor, MockExtensionConfiguration, MockExtensionContext } from '../mocks/MockObjects';
import { IExistingPaths } from '../../IExtensionContext';
import { ExistingPathResolver } from '../../Acquisition/ExistingPathResolver';
import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';
import { MockExtensionConfigurationWorker } from '../mocks/MockExtensionConfigurationWorker';
import { IDotnetAcquireContext } from '../../IDotnetAcquireContext';
import { getMockAcquisitionContext, getMockAcquisitionWorkerContext, getMockUtilityContext } from './TestUtility';
import { CommandExecutorResult } from '../../Utils/CommandExecutorResult';
import { DotnetInstallMode } from '../../Acquisition/DotnetInstallMode';
import { mock } from 'node:test';
const assert = chai.assert;

const individualPath = 'foo';
const sharedPath = 'bar';

const mockPaths: IExistingPaths = {
    individualizedExtensionPaths: [{extensionId: 'alternative.extension', path: individualPath}],
    sharedExistingPath: sharedPath
}

const extensionConfiguration = new MockExtensionConfiguration(mockPaths.individualizedExtensionPaths!, true, mockPaths.sharedExistingPath!);
const extensionConfigWorker = new MockExtensionConfigurationWorker(mockPaths);
const standardTimeoutTime = 5000;
const mockUtility = getMockUtilityContext();

const listRuntimesResultWithEightOnly = `
Microsoft.NETCore.App 8.0.7 [C:\\Program Files\\dotnet\\shared\\Microsoft.AspNetCore.App]

`;
const executionResultWithEightOnly = { status : '', stdout: listRuntimesResultWithEightOnly, stderr: '' };

const listRuntimesResultWithEightASPOnly = `
Microsoft.AspNetCore.App 8.0.7 [C:\\Program Files\\dotnet\\shared\\Microsoft.AspNetCore.App]

`;
const executionResultWithEightAspOnly = { status : '', stdout: listRuntimesResultWithEightASPOnly, stderr: '' };

const listSDKsResultWithEightOnly = `
8.0.101 [C:\\Program Files\\dotnet\\sdk]
`;
const executionResultWithListSDKsResultWithEightOnly = { status : '', stdout: listSDKsResultWithEightOnly, stderr: '' };

function getExistingPathResolverWithVersionAndCommandResult(version: string, requestingExtensionId : string | undefined, commandResult: CommandExecutorResult, allowInvalidPaths = false, mode : DotnetInstallMode | undefined = undefined) : ExistingPathResolver
{
    const context: IDotnetAcquireContext = { version: version, requestingExtensionId: requestingExtensionId, mode: mode ?? 'runtime'};
    const newConfig = new MockExtensionContext();
    if(allowInvalidPaths)
    {
        newConfig.update('dotnetAcquisitionExtension.allowInvalidPaths', true);
    }
    const mockWorkerContext = getMockAcquisitionContext(mode ?? 'runtime', version, undefined, undefined, newConfig);
    mockWorkerContext.acquisitionContext = context;

    const mockExecutor = new MockCommandExecutor(mockWorkerContext, mockUtility);
    mockExecutor.fakeReturnValue = commandResult;
    const existingPathResolver = new ExistingPathResolver(mockWorkerContext, mockUtility, mockExecutor);
    return existingPathResolver;
}

suite('ExistingPathResolver Unit Tests', () => {

    test('Use Shared Existing Path Setting over Individual Setting when no Extension Id is Provided', async () =>
    {
      const existingPathResolver = getExistingPathResolverWithVersionAndCommandResult('8.0', undefined, executionResultWithEightOnly);

      const existingPath = await existingPathResolver.resolveExistingPath(extensionConfigWorker.getAllPathConfigurationValues(), undefined, new MockWindowDisplayWorker());
      assert(existingPath, 'The existing path is returned');
      assert(existingPath?.dotnetPath, 'The existing path is using a dotnet path object');
      assert.equal(existingPath?.dotnetPath, sharedPath);
  }).timeout(standardTimeoutTime);

  test('Prefer Individual Existing Path Setting over Shared Setting', async () =>
  {
      const extensionIdAlt = 'alternative.extension';
      const existingPathResolver = getExistingPathResolverWithVersionAndCommandResult('8.0', extensionIdAlt, executionResultWithEightOnly);

      const existingPath = await existingPathResolver.resolveExistingPath(extensionConfigWorker.getAllPathConfigurationValues(), extensionIdAlt, new MockWindowDisplayWorker());
      assert(existingPath, 'The existing path is returned');
      assert(existingPath?.dotnetPath, 'The existing path is using a dotnet path object');
      assert.equal(existingPath?.dotnetPath, individualPath);
  }).timeout(standardTimeoutTime);

  test('It will use the legacy mode and return the path even if it does not meet an api request if invalidPathsAllowed is set', async () =>
  {
    const existingPathResolver = getExistingPathResolverWithVersionAndCommandResult('7.0', undefined, executionResultWithEightOnly, true);
    const existingPath = await existingPathResolver.resolveExistingPath(extensionConfigWorker.getAllPathConfigurationValues(), undefined, new MockWindowDisplayWorker());
    assert.equal(existingPath?.dotnetPath, sharedPath, 'The setting is used even if it does not match the API request if invalid paths option is set');
  }).timeout(standardTimeoutTime);

  test('It will not return the path setting if the path does not include a runtime that matches the api request', async () =>
  {
    const existingPathResolver = getExistingPathResolverWithVersionAndCommandResult('7.0', undefined, executionResultWithEightOnly);
    const existingPath = await existingPathResolver.resolveExistingPath(extensionConfigWorker.getAllPathConfigurationValues(), undefined, new MockWindowDisplayWorker());
    assert.equal(existingPath, undefined, 'It returns undefined when the setting does not match the API request');
  }).timeout(standardTimeoutTime);

  test('It will not return the path setting if the path does includes a runtime that matches the api request but not an aspnet runtime', async () =>
    {
      const existingPathResolver = getExistingPathResolverWithVersionAndCommandResult('8.0', undefined, executionResultWithEightOnly, false, 'aspnetcore');
      const existingPath = await existingPathResolver.resolveExistingPath(extensionConfigWorker.getAllPathConfigurationValues(), undefined, new MockWindowDisplayWorker());
      assert.equal(existingPath, undefined, 'It returns undefined when the setting does not match the API request');
    }).timeout(standardTimeoutTime);

  test('It will still use the PATH if it has an SDK which satisfies the condition even if there is no runtime that does', async () =>
  {
    const context: IDotnetAcquireContext = { version: '8.0', mode : 'runtime' };
    const mockWorkerContext = getMockAcquisitionWorkerContext(context);
    const mockExecutor = new MockCommandExecutor(mockWorkerContext, mockUtility);
    mockExecutor.fakeReturnValue = executionResultWithEightAspOnly;
    mockExecutor.otherCommandPatternsToMock = ['--list-runtimes', '--list-sdks'];
    mockExecutor.otherCommandsReturnValues = [executionResultWithEightAspOnly, executionResultWithListSDKsResultWithEightOnly];
    const existingPathResolver = new ExistingPathResolver(mockWorkerContext, mockUtility, mockExecutor);

    const existingPath = await existingPathResolver.resolveExistingPath(extensionConfigWorker.getAllPathConfigurationValues(), undefined, new MockWindowDisplayWorker());
    assert(existingPath, 'The existing path is returned when an SDK matches the path but no runtime is installed');
    assert(existingPath?.dotnetPath, 'The existing path is using a dotnet path object');
    assert.equal(existingPath?.dotnetPath, sharedPath);
  }).timeout(standardTimeoutTime);
});
