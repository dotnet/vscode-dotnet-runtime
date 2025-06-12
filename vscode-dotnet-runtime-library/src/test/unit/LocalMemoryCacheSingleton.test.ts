/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as lodash from 'lodash';

import { DOTNET_INFORMATION_CACHE_DURATION_MS } from '../../Acquisition/CacheTimeConstants';
import { DotnetPathFinder } from '../../Acquisition/DotnetPathFinder';
import { CacheAliasCreated, CacheGetEvent, CachePutEvent } from '../../EventStream/EventStreamEvents';
import { LocalMemoryCacheMetadata, LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor, MockEventStream, MockFileUtilities } from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
const assert = chai.assert;
const cacheTime = 90000;

suite('LocalMemoryCacheSingleton Unit Tests', function ()
{
    const eventStream = new MockEventStream();
    const mockContext = getMockAcquisitionContext('sdk', '8.0', undefined, eventStream);
    const mockUtility = getMockUtilityContext();
    const mockExecutor = new MockCommandExecutor(mockContext, mockUtility);
    const mockFile = new MockFileUtilities();

    this.afterEach(async () =>
    {
        LocalMemoryCacheSingleton.getInstance().invalidate();
        WebRequestWorkerSingleton.getInstance().destroy();
        eventStream.events = [];
    });

    test('It caches path lookup', async () =>
    {
        const finder = new DotnetPathFinder(mockContext, mockUtility, mockExecutor, mockFile);
        const result = await finder.getTruePath(['dotnet'], null);

        const cachePutEvent = eventStream.events.find(event => event instanceof CachePutEvent && Number((event as CachePutEvent).ttl) === DOTNET_INFORMATION_CACHE_DURATION_MS
            && (event as CachePutEvent).indexStr.includes('--list-runtimes') && (event as CachePutEvent).indexStr.includes('dotnet'));

        const cacheShouldBeEmptyOneTimeEvent = eventStream.events.find(event => event instanceof CacheGetEvent
            && (event as CacheGetEvent).indexStr.includes('--list-runtimes') && (event as CacheGetEvent).value === 'undefined');

        assert.exists(cachePutEvent, `The cache put event was found: ${JSON.stringify(eventStream.events)}.`);
        assert.exists(cacheShouldBeEmptyOneTimeEvent, `The cache was checked but it was empty at first: ${JSON.stringify(eventStream.events, null, " ")}`);

        const secondResult = await finder.getTruePath(['dotnet'], null);

        const cacheShouldHaveItEvent = eventStream.events.find(event => event instanceof CacheGetEvent
            && (event as CacheGetEvent).indexStr.includes('dotnet') && (event as CacheGetEvent).indexStr.includes('--list-runtimes') && (event as CacheGetEvent).value !== undefined);

        assert.exists(cacheShouldHaveItEvent, `The cache was checked and it wasn't empty later: ${JSON.stringify(eventStream.events, null, " ")}`);
    }).timeout(10000 * 2);

    test('It does not fail if ttl is 0', async () =>
    {
        LocalMemoryCacheSingleton.getInstance().put('foo', 'bar', { ttlMs: 0 } as LocalMemoryCacheMetadata, mockContext);
        const resultShouldNotExist = LocalMemoryCacheSingleton.getInstance().get('foo', mockContext);
        assert.equal(resultShouldNotExist, undefined, 'The cache does not cache with ttl as 0');

        LocalMemoryCacheSingleton.getInstance().put('foo', 'bar', { ttlMs: cacheTime } as LocalMemoryCacheMetadata, mockContext);
        const resultShouldExist = LocalMemoryCacheSingleton.getInstance().get('foo', mockContext);
        assert.equal(resultShouldExist, 'bar', 'The cache caches after 0 but renewed ttl.');
    });

    test('It correctly uses cache with command aliases', async () =>
    {
        const originalPath = 'dotnet';
        const aliasPath = 'C:\\Program Files\\dotnet\\dotnet.exe';

        const commandArgs = ['--list-sdks'];
        const cacheValue = {
            stdout: '10.0.100 [C:\\Program Files\\dotnet\\sdk]',
            stderr: '',
            status: '0'
        };

        const cacheCommand = {
            command: {
                commandRoot: originalPath,
                commandParts: commandArgs,
                runUnderSudo: false
            },
            options: { dotnetInstallToolCacheTtlMs: cacheTime }
        };

        const aliasCommand = lodash.cloneDeep(cacheCommand);
        aliasCommand.command.commandRoot = aliasPath;

        LocalMemoryCacheSingleton.getInstance().putCommand(cacheCommand, cacheValue, mockContext);

        assert.deepEqual(LocalMemoryCacheSingleton.getInstance().getCommand(cacheCommand, mockContext), cacheValue);
        assert.isUndefined(LocalMemoryCacheSingleton.getInstance().getCommand(aliasCommand, mockContext));

        LocalMemoryCacheSingleton.getInstance().aliasCommandAsAnotherCommandRoot(aliasPath, originalPath, eventStream);
        assert.deepEqual(LocalMemoryCacheSingleton.getInstance().getCommand(aliasCommand, mockContext), cacheValue);

        const aliasEvent = eventStream.events.find(event =>
            event instanceof CacheAliasCreated &&
            (event as CacheAliasCreated).eventMessage.includes(aliasPath)
        );
        assert.exists(aliasEvent);
    });

    test('It handles command options with different properties correctly', async () =>
    {
        const commandRoot = 'dotnet';
        const commandArgs = ['--list-runtimes'];
        const outputValue = {
            stdout: 'Microsoft.NETCore.App 10.0.1',
            stderr: '',
            status: '0'
        };

        const originalCommand = {
            command: {
                commandRoot: commandRoot,
                commandParts: commandArgs,
                runUnderSudo: false
            },
            options: { ttl: cacheTime, env: { 'LANG': 'en-US' }, dotnetInstallToolCacheTtlMs: cacheTime }
        };

        const reorderedCommand = {
            command: {
                commandRoot: commandRoot,
                commandParts: commandArgs,
                runUnderSudo: false
            },
            options: { env: { 'LANG': 'en-US' }, ttl: cacheTime, dotnetInstallToolCacheTtlMs: cacheTime }
        };

        const differentCommand = {
            command: {
                commandRoot: commandRoot,
                commandParts: commandArgs,
                runUnderSudo: false
            },
            options: { ttl: cacheTime, verbose: true, dotnetInstallToolCacheTtlMs: cacheTime }
        };

        LocalMemoryCacheSingleton.getInstance().putCommand(originalCommand, outputValue, mockContext);

        assert.deepEqual(LocalMemoryCacheSingleton.getInstance().getCommand(originalCommand, mockContext), outputValue, 'The original command should return the cached value.');
        assert.deepEqual(LocalMemoryCacheSingleton.getInstance().getCommand(reorderedCommand, mockContext), outputValue, 'The reordered command should return the same cached value.');
        assert.equal(LocalMemoryCacheSingleton.getInstance().getCommand(differentCommand, mockContext), undefined, 'A command with different options values should not be cached');
    });
});
