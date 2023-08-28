/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import Axios from 'axios';
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
        private readonly websiteTimeoutMs: number, // Match the default timeout time of 10 minutes.
        private cacheTimeToLive = -1
        )
        {
            this.cacheTimeToLive = this.cacheTimeToLive === -1 ? this.websiteTimeoutMs * 100 : this.cacheTimeToLive; // make things live 100x the default time, which is ~16 hrs
            const uncachedAxiosClient = Axios.create({});
            Debugging.log(`Axios client instantiated: ${uncachedAxiosClient}`);

            // Wrap the client with a retry interceptor. We don't need to return a new client, it should be applied automatically.
            axiosRetry(uncachedAxiosClient, {
                // Inject a custom retry delay to expoentially increase the time until we retry.
                retryDelay(retryCount: number) {
                    return Math.pow(2, retryCount); // Takes in the int as (ms) to delay.
                }
            });

            Debugging.log(`Axios client wrapped around axios-retry: ${uncachedAxiosClient}`);

            this.client = setupCache(uncachedAxiosClient,
                {
                    storage: mementoStorage(this.extensionState),
                    ttl: this.cacheTimeToLive
                }
            );

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
        if(url === '' || !url)
        {
            throw new Error(`Request to the url ${this.url} failed, as the URL is invalid.`);
        }
        const timeoutCancelTokenHook = new AbortController();
        const timeout = setTimeout(() =>
        {
            timeoutCancelTokenHook.abort();
            const formattedError = new Error(`TIMEOUT: The request to ${this.url} timed out at ${this.websiteTimeoutMs} ms. This only occurs if your internet
 or the url are experiencing connection difficulties; not if the server is being slow to respond. Check your connection, the url, and or increase the timeout value here: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#install-script-timeouts`);
            this.eventStream.post(new WebRequestError(formattedError));
            throw formattedError;
        }, this.websiteTimeoutMs);

        const response = await this.client.get(url, { signal: timeoutCancelTokenHook.signal, ...options });
        clearTimeout(timeout);

        return response;
    }

    /**
     * @returns The data from a web request that was hopefully cached. Even if it wasn't cached, we will make an attempt to get the data.
     * @remarks This function is no longer needed as the data is cached either way if you call makeWebRequest, but it was kept to prevent breaking APIs.
     */
    public async getCachedData(retriesCount = 2): Promise<string | undefined>
    {
        return this.makeWebRequest(true, retriesCount);
    }

    /**
     *
     * @param urlInQuestion
     * @returns true if the url was in the cache before this function executes, false elsewise.
     *
     * @remarks Calling this WILL put the url data in the cache as we need to poke the cache to properly get the information.
     * (Checking the storage cache state results in invalid results.)
     * Returns false if the url is unavailable.
     */
    protected async isUrlCached(urlInQuestion : string = this.url) : Promise<boolean>
    {
        if(urlInQuestion === '' || !urlInQuestion)
        {
            return false;
        }
        try
        {
            const requestFunction = this.axiosGet(urlInQuestion,  {timeout: this.websiteTimeoutMs});
            const requestResult = await Promise.resolve(requestFunction);
            const cachedState = requestResult.cached;
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
        try
        {
            this.eventStream.post(new WebRequestSent(this.url));
            const response = await this.axiosGet(
                this.url,
                {
                    timeout: this.websiteTimeoutMs,
                    headers: { 'Connection': 'keep-alive' },
                    'axios-retry': { retries: numRetries }
                }
            );

            return response.data;
        }
        catch (error)
        {
            if (throwOnError)
            {
                let formattedError = error as Error;
                if ((formattedError.message as string).toLowerCase().includes('block')) {
                    formattedError = new Error(`Software restriction policy is blocking .NET installation: Request to ${this.url} Failed: ${formattedError.message}`);
                }
                else
                {
                    formattedError = new Error(`Please ensure that you are online: Request to ${this.url} Failed: ${formattedError.message}`);
                }
                this.eventStream.post(new WebRequestError(formattedError));
                throw formattedError;
            }
            return undefined;
        }
    }
}
