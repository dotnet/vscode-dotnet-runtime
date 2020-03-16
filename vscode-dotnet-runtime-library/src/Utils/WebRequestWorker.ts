/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as request from 'request-promise-native';
import { isNullOrUndefined } from 'util';
import { Memento } from 'vscode';
import { IEventStream } from '../EventStream/EventStream';
import { WebRequestError } from '../EventStream/EventStreamEvents';

export class WebRequestWorker {
    private cachedData: any;
    private currentRequest: Promise<any> | undefined;

    constructor(private readonly extensionState: Memento,
                private readonly eventStream: IEventStream,
                private readonly uri: string,
                private readonly extensionStateKey: string) {}

    public async getCachedData(): Promise<string> {
        this.cachedData = this.extensionState.get<string>(this.extensionStateKey);
        if (isNullOrUndefined(this.cachedData)) {
            // Have to acquire data before continuing
            this.cachedData = await this.makeWebRequest(true);
        } else if (isNullOrUndefined(this.currentRequest)) {
            // Update without blocking, continue with cached information
            this.currentRequest = this.makeWebRequest(false);
            this.currentRequest.then((result) => {
                if (!isNullOrUndefined(result)) {
                    this.cachedData = result;
                }
                this.currentRequest = undefined;
            });
        }
        return this.cachedData;
    }

    // Protected for ease of testing
    protected async makeWebRequest(throwOnError: boolean): Promise<any> {
        const options = {
            uri: this.uri,
        };

        try {
            const response = await request.get(options);
            this.cacheResults(response);
            return response;
        } catch (error) {
            if (throwOnError) {
                const formattedError = new Error(`Please ensure that you are online: Request to ${this.uri} Failed: ${error.message}`);
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
