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
    const cachePrefix = "axios-cache";
    return buildStorage({
        set(key: string, value: any) {
            extensionStorage.update(cachePrefix + key, value);
        },
        remove(key: string) {
            extensionStorage.update(cachePrefix + key, undefined);
        },
        find(key: string) {
            return extensionStorage.get(cachePrefix + key) as StorageValue;
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
        private readonly url: string) {

        var uncachedAxiosClient = axios.create({});
        Debugging.log(`Axios client instantiated: ${uncachedAxiosClient}`);

        // Wrap the client with a retry interceptor. We don't need to return a new client, it should be applied automatically.
        axiosRetry(uncachedAxiosClient, {
            // Inject a custom retry delay to expoentially increase the time until we retry.
            retryDelay(retryCount: number) {
                return Math.pow(2, retryCount);
            }
        });

        Debugging.log(`Axios client wrapped around axios-retry: ${uncachedAxiosClient}`);

        this.client = setupCache(uncachedAxiosClient, {
            storage: mementoStorage(extensionState),
        });

        Debugging.log(`Cached Axios Client Created: ${this.client}`);
    }

    public async getCachedData(retriesCount = 2): Promise<string | undefined> {
        Debugging.log(`getCachedData() Invoked.`);
        return await this.makeWebRequest(true, retriesCount);
    }

    // Protected for ease of testing.
    protected async makeWebRequest(throwOnError: boolean, retries: number): Promise<string | undefined> {
        Debugging.log(`makeWebRequest Invoked. Requested URL: ${this.url}`);
        try
        {
            Debugging.log(`Cached value exists? : ${undefined !== (await this.client.storage.get(this.url)).data}`);

            this.eventStream.post(new WebRequestSent(this.url));
            const response = await this.client.get(this.url, {
                headers: {
                    Connection: 'keep-alive'
                },
                // since retry configuration is per-request, we flow that into the retry middleware here
                "axios-retry": {
                    retries: retries,
                },
            });

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
