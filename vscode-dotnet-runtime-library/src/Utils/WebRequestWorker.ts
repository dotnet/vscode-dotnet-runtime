/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { AxiosCacheInstance, buildStorage, setupCache, StorageValue } from 'axios-cache-interceptor';
import { IEventStream } from '../EventStream/EventStream';
import { WebRequestError, WebRequestSent } from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';
import { Debugging } from '../Utils/Debugging';

/*
This wraps the VSCode memento state blob into an axios-cache-interceptor-compatible Storage.
(The momento state is used to save extensionState/data across runs of the extension.)
All the calls are synchronous.
*/
const mementoStorage = (extensionStorage: IExtensionState) => {
    const cachePrefix = "axios-cache"; // Used to make it easier to tell what part of the extension state is from the cache
    return buildStorage({
        set(key: string, value: any) {
            extensionStorage.update(`${cachePrefix}:${key}`, value);
        },
        remove(key: string) {
            extensionStorage.update(`${cachePrefix}:${key}`, undefined);
        },
        find(key: string) {
            return extensionStorage.get(`${cachePrefix}:${key}`) as StorageValue;
        }
    });
}

export class WebRequestWorker {
    /**
     * @remarks
     * An interface for sending get requests to APIS.
     * The responses from GET requests are cached with a 'time-to-live' of 5 minutes by default.
     */
    private client: AxiosCacheInstance;

    constructor(
        private readonly extensionState: IExtensionState,
        private readonly eventStream: IEventStream,
        private readonly url: string,
        private readonly cacheTimeToLive = 1000 * 60 * 5 // 5 minutes
        )
        {
            var uncachedAxiosClient = axios.create({});
            Debugging.log(`Axios client instantiated: ${uncachedAxiosClient}`);

            // Wrap the client with a retry interceptor. We don't need to return a new client, it should be applied automatically.
            axiosRetry(uncachedAxiosClient, {
                // Inject a custom retry delay to expoentially increase the time until we retry.
                retryDelay(retryCount: number) {
                    return Math.pow(2, retryCount); // Takes in the int as (ms) to delay.
                }
            });

            Debugging.log(`Axios client wrapped around axios-retry: ${uncachedAxiosClient}`);

            this.client = setupCache(uncachedAxiosClient, {
                storage: mementoStorage(extensionState),
                ttl: cacheTimeToLive
            });

            Debugging.log(`Cached Axios Client Created: ${this.client}`);
    }

    public async getCachedData(retriesCount = 2): Promise<string | undefined> {
        Debugging.log(`getCachedData() Invoked.`);
        Debugging.log(`Cached value state: ${await this.isUrlCached()}`);
        return await this.makeWebRequest(true, retriesCount);
    }

    /**
     * 
     * @param cachedUrl 
     * @returns true if the url was in the cache before this function executes, false elsewise.
     * 
     * @remarks Calling this WILL put the url data in the cache as we need to poke the cache to properly get the information.
     * (Checking the storage cache state results in invalid results.)
     * Returns false if the url is unavailable.
     */
    public async isUrlCached(cachedUrl : string = this.url) : Promise<boolean>
    {
        if(this.url === '')
        {
            return false;
        }
        try
        {
            const cachedState : boolean = (await this.client.get(cachedUrl, {timeout: 900})).cached; // 900 ms timeout is arbitrary but the expected worst case.
            return cachedState;
        }
        catch (error) // The url was unavailable.
        {
            return false;
        }
    }

    // Protected for ease of testing.
    protected async makeWebRequest(throwOnError: boolean, retries: number): Promise<string | undefined> {
        Debugging.log(`makeWebRequest Invoked. Requested URL: ${this.url}`);
        try
        {
            this.eventStream.post(new WebRequestSent(this.url));
            const response = await this.client.get(
                this.url,
                {
                    headers: { 'Connection': 'keep-alive' },
                }
            );

            Debugging.log(`Response: ${response}.`);
            return response.data;
        }
        catch (error)
        {
            Debugging.log(`Error submitting request: ${error}.`);

            if (throwOnError) {
                let formattedError = error as Error;
                if ((formattedError.message as string).toLowerCase().includes('block')) {
                    Debugging.log(`Software policy is blocking the request.`);
                    formattedError = new Error(`Software restriction policy is blocking .NET installation: Request to ${this.url} Failed: ${formattedError.message}`);
                }
                else
                {
                    Debugging.log(`A request was made but the request failed.`);
                    formattedError = new Error(`Please ensure that you are online: Request to ${this.url} Failed: ${formattedError.message}`);
                }
                this.eventStream.post(new WebRequestError(formattedError));
                throw formattedError;
            }

            Debugging.log(`Returning undefined result.`);
            return undefined;
        }
    }

}
