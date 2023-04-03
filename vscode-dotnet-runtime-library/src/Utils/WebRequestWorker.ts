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
    const cachePrefix = 'axios-cache'; // Used to make it easier to tell what part of the extension state is from the cache
    return buildStorage({
        // tslint:disable-next-line
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
        private readonly cacheTimeToLive = 1000 * 60 * 5, // 5 minutes
        private readonly websiteTimeoutMs = 1000 // 900 ms timeout is arbitrary but the expected worst case.
        )
        {
            const uncachedAxiosClient = axios.create({});
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
                storage: mementoStorage(this.extensionState),
                ttl: this.cacheTimeToLive
            });

            Debugging.log(`Cached Axios Client Created: ${this.client}`);
    }

    /**
     *
     * @param url The URL of the website to send a get request to.
     * @param options The AXIOS flavor options dictonary which will be forwarded to an axios call.
     * @returns The response from AXIOS. The response may be in ANY type, string by default, but maybe even JSON ...
     * depending on whatever the request return content can be casted to.
     * @remarks This function is used as a custom axios.get with a timeout because axios does not correctly handle CONNECTION-based timeouts:
     * https://github.com/axios/axios/issues/647 (e.g. bad URL/site down).
     */
    private async axiosGet(url : string, options = {})
    {

        /**
        if(url === '' || url === undefined || url === null)
        {
            throw new Error(`Request to the url ${this.url} failed, as the URL is invalid.`);
        }
        */
        const abort = axios.CancelToken.source()
        const id = setTimeout(
            () => abort.cancel(`Timeout, ${url} is unavailable.`),
            this.websiteTimeoutMs
        )
        return this.client
            .get(url, { cancelToken: abort.token, ...options })
            .then(response => {
            clearTimeout(id)
            return response
            })
    }

    /**
     * @returns The data from a web request that was hopefully cached. Even if it wasn't cached, we will make an attempt to get the data.
     * @remarks This function is no longer needed as the data is cached either way if you call makeWebRequest, but it was kept to prevent breaking APIs.
     */
    public async getCachedData(retriesCount = 2): Promise<string | undefined> {
        Debugging.log(`getCachedData() Invoked.`);
        Debugging.log(`Cached value state: ${await this.isUrlCached()}`);
        return this.makeWebRequest(true, retriesCount);
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
            const cachedState : boolean = (await this.axiosGet(cachedUrl, {timeout: this.websiteTimeoutMs})).cached;
            return cachedState;
        }
        catch (error) // The url was unavailable.
        {
            return false;
        }
    }

    /**
     *
     * @param throwOnError Should we throw if the connection fails, there's a bad URL passed in, or something else goes wrong?
     * @param numRetries The number of retry attempts if the url is not giving a good response.
     * @returns The data returned from a get request to the url. It may be of string type, but it may also be of another type if the return result is convertable (e.g. JSON.)
     * @remarks protected for ease of testing.
     */
    protected async makeWebRequest(throwOnError: boolean, numRetries: number): Promise<string | undefined> {
        Debugging.log(`makeWebRequest Invoked. Requested URL: ${this.url}`);
        try
        {
            this.eventStream.post(new WebRequestSent(this.url));
            const response = await this.axiosGet(
                this.url,
                {
                    headers: { 'Connection': 'keep-alive' },
                    'axios-retry': { retries: numRetries }
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
