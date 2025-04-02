/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as os from 'os';
import { DotnetInstallMode } from '../../Acquisition/DotnetInstallMode';
import { ExistingPathResolver } from '../../Acquisition/ExistingPathResolver';
import { IDotnetAcquireContext } from '../../IDotnetAcquireContext';
import { IExistingPaths } from '../../IExtensionContext';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { CommandExecutorResult } from '../../Utils/CommandExecutorResult';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockExtensionConfigurationWorker } from '../mocks/MockExtensionConfigurationWorker';
import { MockCommandExecutor, MockExtensionConfiguration, MockExtensionContext } from '../mocks/MockObjects';
import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';
import { getMockAcquisitionContext, getMockAcquisitionWorkerContext, getMockUtilityContext } from './TestUtility';
const assert = chai.assert;

const individualPath = 'foo';
const sharedPath = 'bar';

const mockPaths: IExistingPaths = {
  individualizedExtensionPaths: [{ extensionId: 'alternative.extension', path: individualPath }],
  sharedExistingPath: sharedPath
}

const extensionConfiguration = new MockExtensionConfiguration(mockPaths.individualizedExtensionPaths!, true, mockPaths.sharedExistingPath!);
const extensionConfigWorker = new MockExtensionConfigurationWorker(mockPaths);
const standardTimeoutTime = 5000;
const mockUtility = getMockUtilityContext();

const listRuntimesResultWithEightOnly = `
Microsoft.NETCore.App 8.0.7 [C:\\Program Files\\dotnet\\shared\\Microsoft.AspNetCore.App]

`;
const executionResultWithEightOnly = { status: '0', stdout: listRuntimesResultWithEightOnly, stderr: '' };

const listRuntimesResultWithEightASPOnly = `
Microsoft.AspNetCore.App 8.0.7 [C:\\Program Files\\dotnet\\shared\\Microsoft.AspNetCore.App]

`;
const executionResultWithEightAspOnly = { status: '0', stdout: listRuntimesResultWithEightASPOnly, stderr: '' };

const listSDKsResultWithEightOnly = `
8.0.101 [C:\\Program Files\\dotnet\\sdk]
`
const executionResultWithListSDKsResultWithEightOnly = { status: '0', stdout: listSDKsResultWithEightOnly, stderr: '' };

function getExistingPathResolverWithVersionAndCommandResult(version: string, requestingExtensionId: string | undefined, commandResult: CommandExecutorResult, allowInvalidPaths = false, mode: DotnetInstallMode | undefined = undefined): ExistingPathResolver
{
  const context: IDotnetAcquireContext = { version: version, requestingExtensionId: requestingExtensionId, mode: mode ?? 'runtime' };
  const newConfig = new MockExtensionContext();
  if (allowInvalidPaths)
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

suite('ExistingPathResolver Unit Tests', function ()
{
  this.afterEach(async () =>
  {
    // Tear down tmp storage for fresh run
    WebRequestWorkerSingleton.getInstance().destroy();
    LocalMemoryCacheSingleton.getInstance().invalidate();
  });

  test('Use Shared Existing Path Setting over Individual Setting when no Extension Id is Provided', async () =>
  {
    const existingPathResolver = getExistingPathResolverWithVersionAndCommandResult('8.0', undefined, executionResultWithEightOnly);

    const existingPath = await existingPathResolver.resolveExistingPath(extensionConfigWorker.getAllPathConfigurationValues(), undefined, new MockWindowDisplayWorker());
    const nonTrueExistingPath = existingPathResolver.getlastSeenNonTruePathValue();

    assert(existingPath, 'The existing path is returned');
    assert(nonTrueExistingPath, 'The existing path is using a dotnet path object');
    assert.equal(nonTrueExistingPath, sharedPath);
    assert.equal(existingPath?.dotnetPath, os.platform() === 'win32' ? 'C:\\Program Files\\dotnet\\dotnet.exe' : 'dotnet', 'The true path is called on the fake path to get dotnet executable');
  }).timeout(standardTimeoutTime);

  test('Prefer Individual Existing Path Setting over Shared Setting', async () =>
  {
    const extensionIdAlt = 'alternative.extension';
    const existingPathResolver = getExistingPathResolverWithVersionAndCommandResult('8.0', extensionIdAlt, executionResultWithEightOnly);

    const existingPath = await existingPathResolver.resolveExistingPath(extensionConfigWorker.getAllPathConfigurationValues(), extensionIdAlt, new MockWindowDisplayWorker());
    const nonTrueExistingPath = existingPathResolver.getlastSeenNonTruePathValue();

    assert(existingPath, 'The existing path is returned');
    assert(nonTrueExistingPath, 'The existing path is using a dotnet path object');
    assert.equal(nonTrueExistingPath, individualPath);
    assert.equal(existingPath?.dotnetPath, os.platform() === 'win32' ? 'C:\\Program Files\\dotnet\\dotnet.exe' : 'dotnet', 'The true path is called on the fake path to get dotnet executable');
  }).timeout(standardTimeoutTime);

  test('It will use the legacy mode and return the path even if it does not meet an api request if allowInvalidPaths is set', async () =>
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

  test('It will not use the PATH if it does not have a runtime which satisfies the condition even if there is an SDK that does', async () =>
  {
    const context: IDotnetAcquireContext = { version: '8.0', mode: 'runtime' };
    const mockWorkerContext = getMockAcquisitionWorkerContext(context);
    mockWorkerContext.extensionState.update('dotnetAcquisitionExtension.allowInvalidPaths', true);
    const mockExecutor = new MockCommandExecutor(mockWorkerContext, mockUtility);
    mockExecutor.fakeReturnValue = executionResultWithEightAspOnly;
    mockExecutor.otherCommandPatternsToMock = ['--list-runtimes', '--list-sdks'];
    mockExecutor.otherCommandsReturnValues = [executionResultWithEightAspOnly, executionResultWithListSDKsResultWithEightOnly];
    const existingPathResolver = new ExistingPathResolver(mockWorkerContext, mockUtility, mockExecutor);

    const existingPath = await existingPathResolver.resolveExistingPath(extensionConfigWorker.getAllPathConfigurationValues(), undefined, new MockWindowDisplayWorker());

    assert.notExists(existingPath, 'The existing path is not returned when an SDK matches the path but no runtime is installed');
  }).timeout(standardTimeoutTime);
});
