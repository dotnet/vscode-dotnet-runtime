/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import Axios from 'axios';
import axiosRetry from 'axios-retry';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { getProxySettings } from 'get-proxy-settings';
import { AxiosCacheInstance, buildStorage, setupCache, StorageValue } from 'axios-cache-interceptor';
import {SuppressedAcquisitionError, WebRequestError, WebRequestSent } from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';
import { Debugging } from '../Utils/Debugging';
import * as fs from 'fs';
import { promisify } from 'util';
import stream = require('stream');
import { getInstallKeyFromContext } from '../IDotnetAcquireContext';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
/* tslint:disable:no-any */

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

export class WebRequestWorker
{
    /**
     * @remarks
     * An interface for sending get requests to APIS.
     * The responses from GET requests are cached with a 'time-to-live' of 5 minutes by default.
     */
    private client: AxiosCacheInstance;
    private websiteTimeoutMs : number;
    private proxy : string | undefined;

    private proxyAgent : HttpsProxyAgent<string> | null = null;

    constructor(
        private readonly context: IAcquisitionWorkerContext,
        protected readonly url: string,
        private cacheTimeToLive = -1
    )
    {
        this.websiteTimeoutMs = this.context.timeoutSeconds * 1000;
        this.proxy = this.context.proxyUrl;
        this.cacheTimeToLive = this.cacheTimeToLive === -1 ? this.websiteTimeoutMs * 100 : this.cacheTimeToLive; // make things live 100x the default time, which is ~16 hrs
        const uncachedAxiosClient = Axios.create({});
        Debugging.log(`Axios client instantiated: ${uncachedAxiosClient}`);

        // Wrap the client with a retry interceptor. We don't need to return a new client, it should be applied automatically.
        axiosRetry(uncachedAxiosClient, {
            // Inject a custom retry delay to exponentially increase the time until we retry.
            retryDelay(retryCount: number) {
                return Math.pow(2, retryCount); // Takes in the int as (ms) to delay.
            }
        });

        Debugging.log(`Axios client wrapped around axios-retry: ${uncachedAxiosClient}`);

        this.client = setupCache(uncachedAxiosClient,
            {
                storage: mementoStorage(this.context.extensionState),
                ttl: this.cacheTimeToLive
            }
        );

        Debugging.log(`Cached Axios Client Created: ${this.client}`);
    }

    /**
     *
     * @param url The URL of the website to send a get request to.
     * @param options The AXIOS flavor options dictionary which will be forwarded to an axios call.
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
            this.context.eventStream.post(new WebRequestError(formattedError, getInstallKeyFromContext(this.context.acquisitionContext!)));
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
     * @returns true if the url was in the cache before this function executes, false else.
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
            const requestFunction = this.axiosGet(urlInQuestion, await this.getAxiosOptions(3));
            const requestResult = await Promise.resolve(requestFunction);
            const cachedState = requestResult.cached;
            return cachedState;
        }
        catch (error) // The url was unavailable.
        {
            return false;
        }
    }

    private async ActivateProxyAgentIfFound()
    {
        if(!this.proxyEnabled())
        {
            try
            {
                const autoDetectProxies = await getProxySettings();
                if(autoDetectProxies?.https)
                {
                    this.proxy = autoDetectProxies.https.toString();
                }
                else if(autoDetectProxies?.http)
                {
                    this.proxy = autoDetectProxies.http.toString();
                }
            }
            catch(error : any)
            {
                this.context.eventStream.post(new SuppressedAcquisitionError(error, `The proxy lookup failed, most likely due to limited registry access. Skipping automatic proxy lookup.`));
            }
        }
        if(this.proxyEnabled())
        {
            this.proxyAgent = new HttpsProxyAgent(this.proxy);
        }
    }

    /**
     * @returns an empty promise. It will download the file from the url. The url is expected to be a file server that responds with the file directly.
     * We cannot use a simpler download pattern because we need to download the byte stream 1-1.
     */
    public async downloadFile(url : string, dest : string)
    {
        if(fs.existsSync(dest))
        {
            return;
        }

        const finished = promisify(stream.finished);
        const file = fs.createWriteStream(dest, { flags: 'wx' });
        const options = await this.getAxiosOptions(3, {responseType: 'stream', transformResponse: (x : any) => x}, false);
        await this.axiosGet(url, options)
        .then(response =>
        {
            response.data.pipe(file);
            return finished(file);
        });
    }

    private async getAxiosOptions(numRetries: number, furtherOptions? : {}, keepAlive = true)
    {
        await this.ActivateProxyAgentIfFound();

        const options = {
            timeout: this.websiteTimeoutMs,
            'axios-retry': { retries: numRetries },
            ...(keepAlive && {headers: { 'Connection': 'keep-alive' }}),
            ...(this.proxyEnabled() && {proxy : false}),
            ...(this.proxyEnabled() && {httpsAgent : this.proxyAgent}),
            ...furtherOptions
        };

        return options;
    }

    /**
     *
     * @param throwOnError Should we throw if the connection fails, there's a bad URL passed in, or something else goes wrong?
     * @param numRetries The number of retry attempts if the url is not giving a good response.
     * @returns The data returned from a get request to the url. It may be of string type, but it may also be of another type if the return result is convert-able (e.g. JSON.)
     * @remarks protected for ease of testing.
     */
    protected async makeWebRequest(throwOnError: boolean, numRetries: number): Promise<string | undefined>
    {
        const options = await this.getAxiosOptions(numRetries);

        try
        {
            this.context.eventStream.post(new WebRequestSent(this.url));
            const response = await this.axiosGet(
                this.url,
                options
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
                    formattedError = new Error(`Please ensure that you are online: Request to ${this.url} Failed: ${formattedError.message}.
If you are on a corporate proxy with a result of 400, you may need to manually set the proxy in our extension settings. Please see https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md for more details.
If your proxy requires credentials and the result is 407: we cannot currently handle your request, and you should configure dotnet manually following the above link.`);
                }
                this.context.eventStream.post(new WebRequestError(formattedError, getInstallKeyFromContext(this.context.acquisitionContext!)));
                throw formattedError;
            }
            return undefined;
        }
    }

    private proxyEnabled() : boolean
    {
        return this.proxy !== '';
    }
}
