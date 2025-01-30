/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
 *  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { IAcquisitionWorkerContext } from "./Acquisition/IAcquisitionWorkerContext";
import * as nodeCache from 'node-cache';
import { CommandExecutorCommand } from "./Utils/CommandExecutorCommand";
import { CommandExecutor } from "./Utils/CommandExecutor";
import { CommandExecutorResult } from "./Utils/CommandExecutorResult";
import { CacheClearEvent, CacheGetEvent, CachePutEvent } from "./EventStream/EventStreamEvents";

interface CacheableCommand
{
    command: CommandExecutorCommand;
    options: any;
}

interface LocalMemoryCacheMetadata
{
    ttlMs: number;
}


export class LocalMemoryCacheSingleton
{
    protected static instance: LocalMemoryCacheSingleton;

    protected cache: nodeCache = new nodeCache();

    protected constructor(public readonly timeToLiveMultiplier = 1)
    {

    }

    /**
     *
     * @param timeToLiveMultiplier The vscode setting that multiplies the time to live of the cache.
     * Allows users to turn off the cache if it causes problems or if its working well to increase the ttl for better performance.
     * Following the pattern of our other vscode settings, this is set initially and should be locked in during extension activation until that logic is decoupled.
     * It'd be best to not try to set this number again after the extension is activated; it will not work.
     *
     * @returns The instance of the singleton.
     */
    public static getInstance(timeToLiveMultiplier = 1) : LocalMemoryCacheSingleton
    {
        if(!LocalMemoryCacheSingleton.instance)
        {
            LocalMemoryCacheSingleton.instance = new LocalMemoryCacheSingleton(timeToLiveMultiplier);
        }

        return LocalMemoryCacheSingleton.instance;
    }

    /**
     * @returns the object in the cache with the key, key. undefined if the cache is empty.
     */
    public get(key : string, context : IAcquisitionWorkerContext) : any
    {
        const result = this.cache.get(key);
        context.eventStream.post(new CacheGetEvent(`Checking the cache at ${new Date().toISOString()}`, key, JSON.stringify(result)));
        return result;
    }

    public getCommand(key : CacheableCommand,  context : IAcquisitionWorkerContext) : CommandExecutorResult | undefined
    {
        return this.get(this.cacheableCommandToKey(key), context);
    }


    public put(key : string, obj : any, metadata : LocalMemoryCacheMetadata, context : IAcquisitionWorkerContext) : void
    {
        metadata.ttlMs = metadata.ttlMs * this.timeToLiveMultiplier;
        context.eventStream.post(new CachePutEvent(`Adding to the cache at ${new Date().toISOString()}`, key, JSON.stringify(obj), metadata.ttlMs.toString()));
        this.cache.set(key, obj, metadata.ttlMs / 1000);
    }

    public putCommand(key : CacheableCommand, obj : any, context : IAcquisitionWorkerContext) : void
    {
        return this.put(this.cacheableCommandToKey(key), obj, {ttlMs : key.options?.dotnetInstallToolCacheTtlMs ?? 5000} as LocalMemoryCacheMetadata, context);
    }

    public invalidate(context? : IAcquisitionWorkerContext) : void
    {
        context?.eventStream.post(new CacheClearEvent(`Wiping the cache at ${new Date().toISOString()}`));
        this.cache.flushAll();
    }

    private cacheableCommandToKey(key : CacheableCommand) : string
    {
        // Don't want the cache ttl to impact the result of whether it's cached or not.
        delete key.options?.dotnetInstallToolCacheTtlMs;
        return `${CommandExecutor.prettifyCommandExecutorCommand(key.command)}${JSON.stringify(key.options)}`;
    }
};
