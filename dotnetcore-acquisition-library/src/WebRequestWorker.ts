/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as request from 'request-promise-native';
import { isNullOrUndefined } from 'util';
import { Memento } from 'vscode';
import { IEventStream } from './EventStream';
import { WebRequestError } from './EventStreamEvents';

export class WebRequestWorker {
    private cachedData: any;

    constructor(private readonly extensionState: Memento,
                private readonly eventStream: IEventStream,
                private readonly uri: string,
                private readonly extensionStateKey: string) {}

    public async getCachedData(): Promise<string> {
        this.cachedData = this.extensionState.get<string>(this.extensionStateKey);
        if (isNullOrUndefined(this.cachedData)) {
            // Have to acquire data before continuing
            this.cachedData = await this.makeWebRequest();
        } else {
            // Update without blocking, continue with cached information
            this.makeWebRequest().then((result) => this.cachedData = result);
        }
        return this.cachedData;
    }

    // Protected for ease of testing TODO add tests
    protected async makeWebRequest(): Promise<any> {
        const options = {
            uri: this.uri,
            responseType: 'blob',
        };

        try {
            const response = await request.get(options);
            // Cache results
            await this.extensionState.update(this.extensionStateKey, response);
            return response;
        } catch (error) {
            this.eventStream.post(new WebRequestError(`Request to ${this.uri} Failed: ${error.message}`));
            throw new Error(`Request to ${this.uri} Failed: ${error.message}`);
        }
    }
}
