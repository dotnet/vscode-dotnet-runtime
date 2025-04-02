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
import { ReadableStream } from 'stream/web';
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
    ProxyUsed,
    SuppressedAcquisitionError,
    WebRequestCachedTime,
    WebRequestError,
    WebRequestInitiated,
    WebRequestSent,
    WebRequestTime,
    WebRequestTimeUnknown,
    WebRequestUsingAltClient
} from '../EventStream/EventStreamEvents';
import { FileUtilities } from './FileUtilities';
import { getInstallFromContext } from './InstallIdUtilities';

export class WebRequestWorkerSingleton
{
    /**
     * @remarks
     * An interface for sending get requests to APIS.
     * The responses from GET requests are cached with a 'time-to-live' of 5 minutes by default.
     */
    private client: AxiosCacheInstance | null;
    protected static instance: WebRequestWorkerSingleton;
    private clientCreationError: any;

    protected constructor()
{
        try
        {
            const uncachedAxiosClient = Axios.create();

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
                    ttl: 120000 // 2 Minute TTL
                }
            );
        }
        catch (error: any) // We don't trust the interceptors / client to not break one another. This will cause a total failure and is not eventstream trackable,
        // Since this is a singleton. Propogate this error so we can report it later when we use the native web mechanism.
        {
            this.clientCreationError = error;
            this.client = null;
        }
    }

    public static getInstance(): WebRequestWorkerSingleton
    {
        if (!WebRequestWorkerSingleton.instance)
        {
            WebRequestWorkerSingleton.instance = new WebRequestWorkerSingleton();
        }

        return WebRequestWorkerSingleton.instance;
    }


    // In the event we want to do this later, keep this for now. ATM it does nothing.
    public destroy()
    {
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
    private async getWithAxiosOrFetch(url: string, ctx: IAcquisitionWorkerContext, options = {}, useFetchDownload = false)
    {
        if (url === '' || !url)
        {
            throw new EventBasedError('AxiosGetFailedWithInvalidURL', `Request to the url ${url} failed, as the URL is invalid.`);
        }
        const timeoutCancelTokenHook = new AbortController();
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        const timeout = setTimeout(async () =>
        {
            timeoutCancelTokenHook.abort();
            ctx.eventStream.post(new WebRequestTime(`Timer for request:`, String(this.timeoutMsFromCtx(ctx)), 'false', url, '777')); // 777 for custom abort status. arbitrary
            if (!(await this.isOnline(ctx.timeoutSeconds, ctx.eventStream)))
            {
                const offlineError = new EventBasedError('DotnetOfflineFailure', 'No internet connection detected: Cannot install .NET');
                ctx.eventStream.post(new DotnetOfflineFailure(offlineError, null));
                throw offlineError;
            }
            const formattedError = new Error(`TIMEOUT: The request to ${url} timed out at ${ctx.timeoutSeconds} s. This only occurs if your internet
 or the url are experiencing connection difficulties; not if the server is being slow to respond. Check your connection, the url, and or increase the timeout value here: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#install-script-timeouts`);
            ctx.eventStream.post(new WebRequestError(new EventBasedError('WebRequestError', formattedError.message, formattedError.stack), null));
            throw formattedError;
        }, this.timeoutMsFromCtx(ctx));

        // Make the web request
        let response;
        if (this.client !== null)
        {
            response = await this.client.get(url, { signal: timeoutCancelTokenHook.signal, ...options });
            // Timeout for Web Request -> Not Timer. (Don't want to introduce more CPU time into timer)
            clearTimeout(timeout);
            this.reportTimeAnalytics(response, options, url, ctx);
        }
        else
        {
            response = await this.getFetchResponse(url, ctx, useFetchDownload);
            clearTimeout(timeout);
        }

        // Response
        return response;
    }

    private async getFetchResponse(url: string, ctx: IAcquisitionWorkerContext, returnDownloadStream = false): Promise<any>
    {
        ctx.eventStream.post(new WebRequestUsingAltClient(url, `Using fetch over axios, as axios failed. Axios failure: ${this.clientCreationError ? JSON.stringify(this.clientCreationError) : ''}`));
        try
        {
            const response = await fetch(url, { signal: AbortSignal.timeout(ctx.timeoutSeconds * 1000) });
            if (url.includes('json'))
            {
                const responseJson = await response.json();
                return { data: responseJson, ...response }
            }
            else
            {
                if (returnDownloadStream && response?.body)
                {
                    // Wrap it in the same data type interface as axios for piping
                    return { data: stream.Readable.fromWeb(response.body as ReadableStream<any>), ...response }
                }
                const responseText = await response.text();
                return { data: responseText, ...response };
            }
        }
        catch (error: any)
        {
            ctx.eventStream.post(new WebRequestError(error, getInstallFromContext(ctx)));
            return null;
        }
    }

    /**
     * @returns The data from a web request that was hopefully cached. Even if it wasn't cached, we will make an attempt to get the data.
     * @remarks This function is no longer needed as the data is cached either way if you call makeWebRequest, but it was kept to prevent breaking APIs.
     */
    public async getCachedData(url: string, ctx: IAcquisitionWorkerContext, retriesCount = 2): Promise<string | undefined>
    {
        return this.makeWebRequest(url, ctx, true, retriesCount);
    }

    private reportTimeAnalytics(response: any, options: any, url: string, ctx: IAcquisitionWorkerContext, manualFinalTime: bigint | null = null): void
    {
        // Streamed responses return out bits of data to be piped, so this would record the end time as if only the first few bytes finished.
        // Instead we can manually report this when the stream is finished.

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!manualFinalTime && options?.responseType === 'stream')
        {
            return;
        }

        // Standard timeout time in NS : 60,000,000,000 is < than std max_safe_int_size: 9,007,199,254,740,991
        const timerPrecision = 2; // decimal places for timer result
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const startTimeNs = (response as any)?.startTime;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const finalTimeNs = manualFinalTime ?? (response as any)?.finalTime;

        let durationMs = '-1';
        if (startTimeNs && finalTimeNs && finalTimeNs - startTimeNs < Number.MAX_SAFE_INTEGER)
        {
            durationMs = (Number(finalTimeNs - startTimeNs) / 1000000).toFixed(timerPrecision);
        }
        else
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            ctx.eventStream.post(new WebRequestTimeUnknown(`Timer for request failed. Start time: ${startTimeNs}, end time: ${finalTimeNs}`, durationMs, 'true', url, String(response?.status)));
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!(response?.cached))
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            ctx.eventStream.post(new WebRequestTime(`Timer for request:`, durationMs, 'true', url, String(response?.status)));
        }
        else
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            ctx.eventStream.post(new WebRequestCachedTime(`Cached Timer for request:`, durationMs, 'true', url, String(response?.status)));
        }
    }

    public async isOnline(timeoutSec: number, eventStream: IEventStream): Promise<boolean>
    {
        const microsoftServerHostName = 'www.microsoft.com';
        const expectedDNSResolutionTimeMs = Math.max(timeoutSec * 10 * 2, 100); // Assumption: DNS resolution should take less than 1/50th of the time it'd take to download .NET.
        // ... 100 ms is there as a default to prevent the dns resolver from throwing a runtime error if the user sets timeoutSeconds to 0.

        const dnsResolver = new dns.promises.Resolver({ timeout: expectedDNSResolutionTimeMs });
        const couldConnect = await dnsResolver.resolve(microsoftServerHostName).then(() =>
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
    protected async isUrlCached(urlInQuestion: string, ctx: IAcquisitionWorkerContext): Promise<boolean>
    {
        if (urlInQuestion === '' || !urlInQuestion)
        {
            return false;
        }
        try
        {
            const response = await this.getWithAxiosOrFetch(urlInQuestion, ctx, await this.getAxiosOptions(ctx, 3));
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const cachedState = response?.cached;
            return cachedState ?? false;
        }
        catch (error) // The url was unavailable.
        {
            return false;
        }
    }

    private async GetProxyAgentIfNeeded(ctx: IAcquisitionWorkerContext): Promise<HttpsProxyAgent<string> | null>
    {
        try
        {
            let discoveredProxy = '';
            if (!this.proxySettingConfiguredManually(ctx))
            {
                const autoDetectProxies = await getProxySettings();
                if (autoDetectProxies?.https)
                {
                    discoveredProxy = autoDetectProxies.https.toString();
                }
                else if (autoDetectProxies?.http)
                {
                    discoveredProxy = autoDetectProxies.http.toString();
                }
            }

            if (this.proxySettingConfiguredManually(ctx) || discoveredProxy)
            {
                const finalProxy = ctx?.proxyUrl && ctx?.proxyUrl !== '""' && ctx?.proxyUrl !== '' ? ctx.proxyUrl : discoveredProxy;
                ctx.eventStream.post(new ProxyUsed(`Utilizing the Proxy : Manual ? ${ctx?.proxyUrl}, Automatic: ${discoveredProxy}, Decision : ${finalProxy}`))
                const proxyAgent = new HttpsProxyAgent(finalProxy);
                return proxyAgent;
            }
        }
        catch (error: any)
        {
            ctx.eventStream.post(new SuppressedAcquisitionError(error, `The proxy lookup failed, most likely due to limited registry access. Skipping automatic proxy lookup.`));
        }

        return null;
    }

    /**
     * @returns an empty promise. It will download the file from the url. The url is expected to be a file server that responds with the file directly.
     * We cannot use a simpler download pattern because we need to download the byte stream 1-1.
     */
    public async downloadFile(url: string, dest: string, ctx: IAcquisitionWorkerContext): Promise<void>
    {
        if (await new FileUtilities().exists(dest))
        {
            return;
        }

        const file = fs.createWriteStream(dest, { flags: 'wx' });
        // Axios Cache Interceptor Does Not Work with Stream Response Types
        const options = await this.getAxiosOptions(ctx, 3, { responseType: 'stream', cache: false }, false);
        try
        {
            await this.getWithAxiosOrFetch(url, ctx, options, true)
                .then(async response =>
                {
                    // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    response?.data?.pipe(file);
                    await promisify(stream.finished)(file)
                        .then(
                            () =>
                            {
                                this.reportTimeAnalytics(response, {}, url, ctx, process.hrtime.bigint());
                            },
                            () =>
                            {
                                this.reportTimeAnalytics(response, {}, url, ctx, process.hrtime.bigint());
                            }
                        );
                    return;
                });
        }
        catch (error: any)
        {
            // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (error?.message && (error?.message as string)?.includes('ENOSPC'))
            {
                const err = new DiskIsFullError(new EventBasedError('DiskIsFullError',
                    `You don't have enough space left on your disk to install the .NET SDK. Please clean up some space.`), getInstallFromContext(ctx));
                ctx.eventStream.post(err);
                throw err.error;
            }
            else
            {
                const err = new DotnetDownloadFailure(new EventBasedError('DotnetDownloadFailure',
                    // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    `We failed to download the .NET Installer. Please try to install the .NET SDK manually. Error: ${error?.message}`), getInstallFromContext(ctx));
                ctx.eventStream.post(err);
                throw err.error;
            }
        }
    }

    private async getAxiosOptions(ctx: IAcquisitionWorkerContext, numRetries: number, furtherOptions?: object, keepAlive = true): Promise<object>
    {
        const proxyAgent = await this.GetProxyAgentIfNeeded(ctx);

        const options: object = {
            timeout: this.timeoutMsFromCtx(ctx),
            'axios-retry': { retries: numRetries },
            ...(keepAlive && { headers: { 'Connection': 'keep-alive' } }),
            ...(proxyAgent !== null && { proxy: false }),
            ...(proxyAgent !== null && { httpsAgent: proxyAgent }),
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
    protected async makeWebRequest(url: string, ctx: IAcquisitionWorkerContext, throwOnError: boolean, numRetries: number): Promise<string | undefined>
    {
        ctx.eventStream.post(new WebRequestInitiated(`Making Web Request For ${url}`));
        const options = await this.getAxiosOptions(ctx, numRetries);

        try
        {
            ctx.eventStream.post(new WebRequestSent(url));
            const response = await this.getWithAxiosOrFetch(url, ctx, { ...options });
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            return response?.data;
        }
        catch (error: any)
        {
            const altResponse = await this.getFetchResponse(url, ctx);
            if (altResponse !== null)
            {
                return altResponse;
            }

            if (throwOnError)
            {
                if (isAxiosError(error))
                {
                    const axiosBasedError = error as AxiosError;
                    // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const summarizedError = new EventBasedError('WebRequestFailedFromAxios',
                        `Request to ${url} Failed: ${axiosBasedError?.message}. Aborting.
${axiosBasedError.cause ? `Error Cause: ${axiosBasedError.cause!.message}` : ``}
Please ensure that you are online.

If you're on a proxy and disable registry access, you must set the proxy in our extension settings. See https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md.`);
                    ctx.eventStream.post(new WebRequestError(summarizedError, getInstallFromContext(ctx)));
                    throw summarizedError;
                }
                else
                {
                    // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const genericError = new EventBasedError('WebRequestFailedGenerically', `Web Request to ${url} Failed: ${error?.message}. Aborting. Stack: ${'stack' in error ? error?.stack : 'unavailable.'}`);
                    ctx.eventStream.post(new WebRequestError(genericError, getInstallFromContext(ctx)));
                    throw genericError;
                }
            }
            return undefined;
        }
    }

    private proxySettingConfiguredManually(ctx: IAcquisitionWorkerContext): boolean
    {
        return ctx?.proxyUrl ? ctx?.proxyUrl !== '""' : false;
    }

    private timeoutMsFromCtx(ctx: IAcquisitionWorkerContext): number
    {
        return ctx?.timeoutSeconds * 1000;
    }
}
