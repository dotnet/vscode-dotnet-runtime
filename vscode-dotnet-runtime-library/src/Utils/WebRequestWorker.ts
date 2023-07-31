/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import retry from 'p-retry';
import * as request from 'request-promise-native';
import { IEventStream } from '../EventStream/EventStream';
import { WebRequestError, WebRequestSent } from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';

export class WebRequestWorker {
    private cachedData: string | undefined;
    private currentRequest: Promise<string | undefined> | undefined;

    constructor(
        private readonly extensionState: IExtensionState,
        private readonly eventStream: IEventStream,
    )
    {
    }

    public async getCachedData(url : string, retriesCount = 2): Promise<string | undefined> {
        this.cachedData = this.extensionState.get<string>(url);
        if (!this.cachedData) {
            // Have to acquire data before continuing
            this.cachedData = await this.makeWebRequestWithRetries(url, true, retriesCount);
        } else if (!this.currentRequest) {
            // Update without blocking, continue with cached information
            this.currentRequest = this.makeWebRequest(url, false);
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
    protected async makeWebRequest(desiredUrl : string, throwOnError: boolean): Promise<string | undefined> {
        const options =
        {
            url: desiredUrl,
            Connection: 'keep-alive',
        };

        try
        {
            this.eventStream.post(new WebRequestSent(desiredUrl));
            const response = await request.get(options);
            this.cacheResults(desiredUrl, response);
            return response;
        }
        catch (error)
        {
            if (throwOnError) {
                let formattedError = error as Error;
                if ((formattedError.message as string).toLowerCase().includes('block')) {
                    formattedError = new Error(`Software restriction policy is blocking .NET installation: Request to ${desiredUrl} Failed: ${formattedError.message}`);
                } else {
                    formattedError = new Error(`Please ensure that you are online: Request to ${desiredUrl} Failed: ${formattedError.message}`);
                }
                this.eventStream.post(new WebRequestError(formattedError));
                throw formattedError;
            }
            return undefined;
        }
    }

    protected async cacheResults(url : string, response: string) {
        await this.extensionState.update(url, response);
    }

    private async makeWebRequestWithRetries(url : string, throwOnError: boolean, retriesCount: number): Promise<string | undefined> {
        return retry(async () => {
            return this.makeWebRequest(url, throwOnError);
        }, { retries: retriesCount, onFailedAttempt: async (error: { attemptNumber: number; }) => {
            await this.delay(Math.pow(2, error.attemptNumber));
        }});
    }

    private delay(ms: number) {
        return new Promise( resolve => setTimeout(resolve, ms) );
    }
}
