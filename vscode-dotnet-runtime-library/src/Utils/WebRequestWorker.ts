/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import Axios, { AxiosError, isAxiosError } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

process.env.VSCODE_DOTNET_INSTALL_TOOL_ORIGINAL_HOME = process.env.HOME
// IMPORTING THIS LIBRARY SETS 'HOME' VARIABLE
// Causing Git to BREAK!
import { getProxySettings } from 'get-proxy-settings';
// NODE JS CASTS UNDEFINED ENV VAR TO STRING 'undefined'
if (process.env.VSCODE_DOTNET_INSTALL_TOOL_ORIGINAL_HOME === 'undefined')
{
    delete process.env.HOME
}
else
{
    process.env.HOME = process.env.VSCODE_DOTNET_INSTALL_TOOL_ORIGINAL_HOME
}

import { AxiosCacheInstance, buildMemoryStorage, setupCache } from 'axios-cache-interceptor';
import * as axiosRetry from 'axios-retry';
import * as dns from 'dns';
import * as fs from 'fs';
import { promisify } from 'util';
import stream = require('stream');

import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { IEventStream } from '../EventStream/EventStream';
import
{
    DiskIsFullError,
    DotnetDownloadFailure,
    DotnetOfflineFailure,
    EventBasedError,
    EventCancellationError,
    OfflineDetectionLogicTriggered,
    SuppressedAcquisitionError,
    WebRequestCachedTime,
    WebRequestError,
    WebRequestSent,
    WebRequestTime,
    WebRequestTimeUnknown
} from '../EventStream/EventStreamEvents';
import { FileUtilities } from './FileUtilities';
import { getInstallFromContext } from './InstallIdUtilities';

export class WebRequestWorker
{
    /**
     * @remarks
     * An interface for sending get requests to APIS.
     * The responses from GET requests are cached with a 'time-to-live' of 5 minutes by default.
     */
    private client: AxiosCacheInstance;
    private websiteTimeoutMs: number;
    private proxy: string | undefined;

    private proxyAgent: HttpsProxyAgent<string> | null = null;

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

        // Wrap the client with a retry interceptor. We don't need to return a new client, it should be applied automatically.
        axiosRetry(uncachedAxiosClient, {
            // Inject a custom retry delay to exponentially increase the time until we retry.
            retryDelay(retryCount: number)
            {
                return Math.pow(2, retryCount); // Takes in the int as (ms) to delay.
            }
        });

        // Record when the web requests begin:
        // Register this so it happens before the cache https://axios-cache-interceptor.js.org/guide/interceptors#explanation
        uncachedAxiosClient.interceptors.request.use(config =>
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (config as any).startTime = process.hrtime.bigint();
            return config;
        });

        // Record when the server responds:
        // Register this so it happens after the cache -- this means we need to check if the result is cached before reporting perf data!
        // ^ the request should not be processed if it is in the cache, it seems nonsensical to check this before the cache is hit even though this is possible
        uncachedAxiosClient.interceptors.response.use(res =>
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (res as any).startTime = (res.config as any).startTime;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (res as any).finalTime = process.hrtime.bigint();
            return res;
        },
            res => // triggered when status code is not 2XX
            {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                (res as any).startTime = (res.config as any).startTime;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                (res as any).finalTime = process.hrtime.bigint();
                return res;
            })

        this.client = setupCache(uncachedAxiosClient,
            {
                storage: buildMemoryStorage(),
                ttl: this.cacheTimeToLive
            }
        );
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
    private async axiosGet(url: string, options = {})
    {
        if (url === '' || !url)
        {
            throw new EventBasedError('AxiosGetFailedWithInvalidURL', `Request to the url ${this.url} failed, as the URL is invalid.`);
        }
        const timeoutCancelTokenHook = new AbortController();
        const timeout = setTimeout(async () =>
        {
            timeoutCancelTokenHook.abort();
            this.context.eventStream.post(new WebRequestTime(`Timer for request:`, String(this.websiteTimeoutMs), 'false', url, '777')); // 777 for custom abort status. arbitrary
            if (!(await WebRequestWorker.isOnline(this.websiteTimeoutMs / 1000, this.context.eventStream)))
            {
                const offlineError = new EventBasedError('DotnetOfflineFailure', 'No internet connection detected: Cannot install .NET');
                this.context.eventStream.post(new DotnetOfflineFailure(offlineError, null));
                throw offlineError;
            }
            const formattedError = new Error(`TIMEOUT: The request to ${this.url} timed out at ${this.websiteTimeoutMs} ms. This only occurs if your internet
 or the url are experiencing connection difficulties; not if the server is being slow to respond. Check your connection, the url, and or increase the timeout value here: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#install-script-timeouts`);
            this.context.eventStream.post(new WebRequestError(new EventBasedError('WebRequestError', formattedError.message, formattedError.stack), null));
            throw formattedError;
        }, this.websiteTimeoutMs);

        // Make the web request
        const response = await this.client.get(url, { signal: timeoutCancelTokenHook.signal, ...options });
        // Timeout for Web Request -> Not Timer. (Don't want to introduce more CPU time into timer)
        clearTimeout(timeout);

        // CDN Timer
        // Standard timeout time in NS : 60,000,000,000 is < than std max_safe_int_size: 9,007,199,254,740,991
        const timerPrecision = 2; // decimal places for timer result
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const startTimeNs = (response as any)?.startTime;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const finalTimeNs = (response as any)?.finalTime;
        let durationMs = '-1';
        if (startTimeNs && finalTimeNs && finalTimeNs - startTimeNs < Number.MAX_SAFE_INTEGER)
        {
            durationMs = (Number(finalTimeNs - startTimeNs) / 1000000).toFixed(timerPrecision);
        }
        else
        {
            this.context.eventStream.post(new WebRequestTimeUnknown(`Timer for request failed. Start time: ${startTimeNs}, end time: ${finalTimeNs}`, durationMs, 'true', url, String(response.status)));
        }
        if (!response.cached)
        {
            this.context.eventStream.post(new WebRequestTime(`Timer for request:`, durationMs, 'true', url, String(response.status)));
        }
        else
        {
            this.context.eventStream.post(new WebRequestCachedTime(`Cached Timer for request:`, durationMs, 'true', url, String(response.status)));
        }

        // Response
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


    public static async isOnline(timeoutSec: number, eventStream: IEventStream): Promise<boolean>
    {
        const microsoftServer = 'www.microsoft.com';
        const expectedDNSResolutionTimeMs = Math.max(timeoutSec * 10, 100); // Assumption: DNS resolution should take less than 1/100 of the time it'd take to download .NET.
        // ... 100 ms is there as a default to prevent the dns resolver from throwing a runtime error if the user sets timeoutSeconds to 0.

        const dnsResolver = new dns.promises.Resolver({ timeout: expectedDNSResolutionTimeMs });
        const couldConnect = await dnsResolver.resolve(microsoftServer).then(() =>
        {
            return true;
        }).catch((error: any) =>
        {
            eventStream.post(new OfflineDetectionLogicTriggered((error as EventCancellationError), `DNS resolution failed at microsoft.com, ${JSON.stringify(error)}.`));
            return false;
        });
        return couldConnect;
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
    protected async isUrlCached(urlInQuestion: string = this.url): Promise<boolean>
    {
        if (urlInQuestion === '' || !urlInQuestion)
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
        if (!this.proxyEnabled())
        {
            try
            {
                const autoDetectProxies = await getProxySettings();
                if (autoDetectProxies?.https)
                {
                    this.proxy = autoDetectProxies.https.toString();
                }
                else if (autoDetectProxies?.http)
                {
                    this.proxy = autoDetectProxies.http.toString();
                }
            }
            catch (error: any)
            {
                this.context.eventStream.post(new SuppressedAcquisitionError(error, `The proxy lookup failed, most likely due to limited registry access. Skipping automatic proxy lookup.`));
            }
        }
        if (this.proxyEnabled() && this.proxy)
        {
            this.proxyAgent = new HttpsProxyAgent(this.proxy);
        }
    }

    /**
     * @returns an empty promise. It will download the file from the url. The url is expected to be a file server that responds with the file directly.
     * We cannot use a simpler download pattern because we need to download the byte stream 1-1.
     */
    public async downloadFile(url: string, dest: string)
    {
<<<<<<< HEAD
        if (fs.existsSync(dest))
{
            return;
        }

        const finished = promisify(stream.finished);
        const file = fs.createWriteStream(dest, { flags: 'wx' });
        const options = await this.getAxiosOptions(3, { responseType: 'stream', transformResponse: (x: any) => x }, false);
        try
        {
            await this.axiosGet(url, options)
                .then(response =>
                {
                    // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    response?.data?.pipe(file);
                    return finished(file);
                });
        }
        catch (error: any)
        {
            // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (error?.message && (error?.message as string)?.includes('ENOSPC'))
            {
                const err = new DiskIsFullError(new EventBasedError('DiskIsFullError',
                    `You don't have enough space left on your disk to install the .NET SDK. Please clean up some space.`), getInstallFromContext(this.context));
                this.context.eventStream.post(err);
                throw err.error;
            }
            else
            {
                const err = new DotnetDownloadFailure(new EventBasedError('DotnetDownloadFailure',
                    // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    `We failed to download the .NET Installer. Please try to install the .NET SDK manually. Error: ${error?.message}`), getInstallFromContext(this.context));
                this.context.eventStream.post(err);
                throw err.error;
            }
        }
    }

    private async getAxiosOptions(numRetries: number, furtherOptions?: object, keepAlive = true): Promise<object>
    {
        await this.ActivateProxyAgentIfFound();

        const options: object = {
            timeout: this.websiteTimeoutMs,
            'axios-retry': { retries: numRetries },
            ...(keepAlive && { headers: { 'Connection': 'keep-alive' } }),
            ...(this.proxyEnabled() && { proxy: false }),
            ...(this.proxyEnabled() && { httpsAgent: this.proxyAgent }),
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
<<<<<<< HEAD
                { transformResponse: (x: any) => x, ...options }
            );

            if (response !== null && response?.headers['content-type'] === 'application/json')
{
                try
                {
                    // Try to copy logic from https://github.com/axios/axios/blob/2e58825bc7773247ca5d8c2cae2ee041d38a0bb5/lib/defaults/index.js#L100
                    const jsonData = JSON.parse(response?.data ?? null);
                    if (jsonData) // JSON.parse(null) => null but JSON.parse(undefined) => SyntaxError. We only want to return undefined and not null based on funct signature.
                    {
                        return jsonData;
                    };
                }
                catch (error: any)
                {

                }
            }
            return response?.data;
        }
        catch (error: any)
        {
            if (throwOnError)
            {
                if (isAxiosError(error))
                {
                    const axiosBasedError = error as AxiosError;
                    // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const summarizedError = new EventBasedError('WebRequestFailedFromAxios',
                        `Request to ${this.url} Failed: ${axiosBasedError?.message}. Aborting.
${axiosBasedError.cause ? `Error Cause: ${axiosBasedError.cause!.message}` : ``}
Please ensure that you are online.

If you're on a proxy and disable registry access, you must set the proxy in our extension settings. See https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md.`);
                    this.context.eventStream.post(new WebRequestError(summarizedError, getInstallFromContext(this.context)));
                    throw summarizedError;
                }
                else
                {
                    // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const genericError = new EventBasedError('WebRequestFailedGenerically', `Web Request to ${this.url} Failed: ${error?.message}. Aborting. Stack: ${'stack' in error ? error?.stack : 'unavailable.'}`);
                    this.context.eventStream.post(new WebRequestError(genericError, getInstallFromContext(this.context)));
                    throw genericError;
                }
            }
            return undefined;
        }
    }

    private proxyEnabled(): boolean
    {
        return this.proxy !== '';
    }
}
