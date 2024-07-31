/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { MockExtensionConfiguration } from '../mocks/MockObjects';
import { IExistingPaths } from '../../IExtensionContext';
import { ExistingPathResolver } from '../../Acquisition/ExistingPathResolver';
import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';
import { MockExtensionConfigurationWorker } from '../mocks/MockExtensionConfigurationWorker';
import { IDotnetAcquireContext } from '../../IDotnetAcquireContext';
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

suite('ExistingPathResolver Unit Tests', () => {

    test('Use Shared Existing Path Setting over Individual Setting when no Extension Id is Provided', async () => {
    const existingPathResolver = new ExistingPathResolver();
    const context: IDotnetAcquireContext = { version: '0.1' };

    const existingPath = existingPathResolver.resolveExistingPath(extensionConfigWorker.getAllPathConfigurationValues(), context.requestingExtensionId, new MockWindowDisplayWorker());
    assert(existingPath, 'The existing path is returned');
    assert(existingPath?.dotnetPath, 'The existing path is using a dotnet path object');
    assert.equal(existingPath?.dotnetPath, sharedPath);
  }).timeout(standardTimeoutTime);

  test('Prefer Individual Existing Path Setting over Shared Setting', async () => {
    const existingPathResolver = new ExistingPathResolver();
    const context: IDotnetAcquireContext = { version: '0.1', requestingExtensionId: 'alternative.extension' };

    const existingPath = existingPathResolver.resolveExistingPath(extensionConfigWorker.getAllPathConfigurationValues(), context.requestingExtensionId, new MockWindowDisplayWorker());
    assert(existingPath, 'The existing path is returned');
    assert(existingPath?.dotnetPath, 'The existing path is using a dotnet path object');
    assert.equal(existingPath?.dotnetPath, individualPath);
  }).timeout(standardTimeoutTime);
});
