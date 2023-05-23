"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebRequestWorker = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const p_retry_1 = require("p-retry");
const request = require("request-promise-native");
const EventStreamEvents_1 = require("../EventStream/EventStreamEvents");
class WebRequestWorker {
    constructor(extensionState, eventStream) {
        this.extensionState = extensionState;
        this.eventStream = eventStream;
    }
    getCachedData(url, retriesCount = 2) {
        return __awaiter(this, void 0, void 0, function* () {
            this.cachedData = this.extensionState.get(url);
            if (!this.cachedData) {
                // Have to acquire data before continuing
                this.cachedData = yield this.makeWebRequestWithRetries(url, true, retriesCount);
            }
            else if (!this.currentRequest) {
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
        });
    }
    // Protected for ease of testing
    makeWebRequest(url, throwOnError) {
        return __awaiter(this, void 0, void 0, function* () {
            const options = {
                url: url,
                Connection: 'keep-alive',
            };
            try {
                this.eventStream.post(new EventStreamEvents_1.WebRequestSent(url));
                const response = yield request.get(options);
                this.cacheResults(url, response);
                return response;
            }
            catch (error) {
                if (throwOnError) {
                    let formattedError = error;
                    if (formattedError.message.toLowerCase().includes('block')) {
                        formattedError = new Error(`Software restriction policy is blocking .NET installation: Request to ${url} Failed: ${formattedError.message}`);
                    }
                    else {
                        formattedError = new Error(`Please ensure that you are online: Request to ${url} Failed: ${formattedError.message}`);
                    }
                    this.eventStream.post(new EventStreamEvents_1.WebRequestError(formattedError));
                    throw formattedError;
                }
                return undefined;
            }
        });
    }
    cacheResults(url, response) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.extensionState.update(url, response);
        });
    }
    makeWebRequestWithRetries(url, throwOnError, retriesCount) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, p_retry_1.default)(() => __awaiter(this, void 0, void 0, function* () {
                return this.makeWebRequest(url, throwOnError);
            }), { retries: retriesCount, onFailedAttempt: (error) => __awaiter(this, void 0, void 0, function* () {
                    yield this.delay(Math.pow(2, error.attemptNumber));
                }) });
        });
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.WebRequestWorker = WebRequestWorker;
//# sourceMappingURL=WebRequestWorker.js.map