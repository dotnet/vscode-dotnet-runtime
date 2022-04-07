/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { IEventStream } from '../EventStream/EventStream';
import { WebRequestError, WebRequestSent } from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';

axiosRetry(axios, {
    retryDelay(retryCount: number) {
        return Math.pow(2, retryCount);
    }
})

export class WebRequestWorker {
    private cachedData: string | undefined;
    private currentRequest: Promise<string | undefined> | undefined;

    constructor(private readonly extensionState: IExtensionState,
        private readonly eventStream: IEventStream,
        private readonly url: string,
        private readonly extensionStateKey: string) {

    }

    public async getCachedData(retriesCount = 2): Promise<string | undefined> {
        this.cachedData = this.extensionState.get<string>(this.extensionStateKey);
        if (!this.cachedData) {
            // Have to acquire data before continuing
            this.cachedData = await this.makeWebRequest(true, retriesCount);
        } else if (!this.currentRequest) {
            // Update without blocking, continue with cached information
            this.currentRequest = this.makeWebRequest(false, 0);
            this.currentRequest.then((result) => {
                if (result) {
                    this.cachedData = result;
                }
                this.currentRequest = undefined;
            });
        }
        return this.cachedData;
    }

    // Protected for ease of testing
    protected async makeWebRequest(throwOnError: boolean, retries: number): Promise<string | undefined> {
        try {
            this.eventStream.post(new WebRequestSent(this.url));
            const responseHeaders = await axios.get(this.url, {
                headers: {
                    Connection: 'keep-alive'
                },
                "axios-retry": {
                    retries: retries,
                }
            });
            const responseBody = await responseHeaders.data;
            this.cacheResults(responseBody);
            return responseBody;
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

    protected async cacheResults(response: string) {
        await this.extensionState.update(this.extensionStateKey, response);
    }
}
