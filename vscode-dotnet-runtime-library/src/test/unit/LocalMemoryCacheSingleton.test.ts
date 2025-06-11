/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { DOTNET_INFORMATION_CACHE_DURATION_MS } from '../../Acquisition/CacheTimeConstants';
import { DotnetPathFinder } from '../../Acquisition/DotnetPathFinder';
import { CacheGetEvent, CachePutEvent } from '../../EventStream/EventStreamEvents';
import { LocalMemoryCacheMetadata, LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockCommandExecutor, MockEventStream, MockFileUtilities } from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';
const assert = chai.assert;

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

        LocalMemoryCacheSingleton.getInstance().put('foo', 'bar', { ttlMs: 90000 } as LocalMemoryCacheMetadata, mockContext);
        const resultShouldExist = LocalMemoryCacheSingleton.getInstance().get('foo', mockContext);
        assert.equal(resultShouldExist, 'bar', 'The cache caches after 0 but renewed ttl.');
    });

    test('It correctly uses cache with command aliases', async () => {
        const originalPath = 'dotnet';
        const aliasPath = 'C:\\Program Files\\dotnet\\dotnet.exe';
        const cacheKey = `${originalPath} --list-sdks`;
        const cacheValue = '10.0.100 [C:\\Program Files\\dotnet\\sdk]`;
        
        // Cache with original path
        LocalMemoryCacheSingleton.getInstance().put(cacheKey, cacheValue, { ttlMs: 90000 } as LocalMemoryCacheMetadata, mockContext);
        
        // Before alias registration
        assert.equal(LocalMemoryCacheSingleton.getInstance().get(cacheKey, mockContext), cacheValue);
        assert.isUndefined(LocalMemoryCacheSingleton.getInstance().get(`${aliasPath} --list-sdks`, mockContext));
        
        // Register alias and test
        LocalMemoryCacheSingleton.getInstance().aliasCommandAsAnotherCommandRoot(aliasPath, originalPath, eventStream);
        assert.equal(LocalMemoryCacheSingleton.getInstance().get(`${aliasPath} --list-sdks`, mockContext), cacheValue);
        
        // Verify event
        const aliasEvent = eventStream.events.find(event => 
            event instanceof CacheAliasCreated && 
            (event as CacheAliasCreated).eventMessage.includes(aliasPath)
        );
        assert.exists(aliasEvent);
    });

    test('It handles command options with different properties correctly', async () => {
        const commandRoot = 'dotnet';
        const commandArgs = ['--list-runtimes'];
        const outputValue = 'Microsoft.NETCore.App 10.0.1';
        
        // Command with original options order
        const originalCommand = {
            command: { commandRoot, args: commandArgs },
            options: { ttl: 90000, env: { 'LANG': 'en-US' } }
        };
        
        // Same options but different order
        const reorderedCommand = {
            command: { commandRoot, args: commandArgs },
            options: { env: { 'LANG': 'en-US' }, ttl: 90000 }
        };
        
        // Different properties
        const differentCommand = {
            command: { commandRoot, args: commandArgs },
            options: { ttl: 90000, verbose: true }
        };
        
        // Cache original command
        LocalMemoryCacheSingleton.getInstance().putCommand(originalCommand, outputValue, mockContext);
        
        // Test results
        assert.equal(LocalMemoryCacheSingleton.getInstance().getCommand(originalCommand, mockContext), outputValue);
        assert.equal(LocalMemoryCacheSingleton.getInstance().getCommand(reorderedCommand, mockContext), outputValue);
        assert.notEqual(LocalMemoryCacheSingleton.getInstance().getCommand(differentCommand, mockContext), outputValue);
    });
});
