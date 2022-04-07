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

/*
This wraps the VSCode memento state blob into an axios-cache-interceptor-compatible Storage.
All the calls are synchronous
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
    private cachedData: string | undefined;
    private client: AxiosCacheInstance;

    constructor(
        private readonly extensionState: IExtensionState,
        private readonly eventStream: IEventStream,
        private readonly url: string) {
        
        // we can configure the retry and cache policies specifically for this axios client
        var c = axios.create({});
        axiosRetry(c, {
            retryDelay(retryCount: number) {
                return Math.pow(2, retryCount);
            }
        });
        this.client = setupCache(c, {
            storage: mementoStorage(extensionState),
        });
    }

    public async getCachedData(retriesCount = 2): Promise<string | undefined> {
        if (!this.cachedData) {
            // Have to acquire data before continuing
            this.cachedData = await this.makeWebRequest(true, retriesCount);
        }
        return this.cachedData;
    }

    // Protected for ease of testing
    protected async makeWebRequest(throwOnError: boolean, retries: number): Promise<string | undefined> {
        try {
            this.eventStream.post(new WebRequestSent(this.url));
            const responseHeaders = await this.client.get(this.url, {
                headers: {
                    Connection: 'keep-alive'
                },
                // since retry configuration is per-request, we flow that into the retry middleware here
                "axios-retry": {
                    retries: retries,
                },
            });
            return responseHeaders.data;
        } catch (error) {
            if (throwOnError) {
                let formattedError = error as Error;
                if ((formattedError.message as string).toLowerCase().includes('block')) {
                    formattedError = new Error(`Software restriction policy is blocking .NET installation: Request to ${this.url} Failed: ${formattedError.message}`);
                } else {
                    formattedError = new Error(`Please ensure that you are online: Request to ${this.url} Failed: ${formattedError.message}`);
                }
                this.eventStream.post(new WebRequestError(formattedError));
                throw formattedError;
            }
            return undefined;
        }
    }

}
