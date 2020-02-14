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
            this.cachedData = await this.makeWebRequest();
        } else if (isNullOrUndefined(this.currentRequest)) {
            // Update without blocking, continue with cached information
            this.currentRequest = this.makeWebRequest();
            this.currentRequest.then((result) => {
                this.cachedData = result;
                this.currentRequest = undefined;
            });
        }
        return this.cachedData;
    }

    // Protected for ease of testing
    protected async makeWebRequest(): Promise<any> {
        const options = {
            uri: this.uri,
        };

        try {
            const response = await request.get(options);
            this.cacheResults(response);
            return response;
        } catch (error) {
            this.eventStream.post(new WebRequestError(error));
            throw new Error(`Request to ${this.uri} Failed: ${error.message}`);
        }
    }

    protected async cacheResults(response: string) {
        await this.extensionState.update(this.extensionStateKey, response);
    }
}
