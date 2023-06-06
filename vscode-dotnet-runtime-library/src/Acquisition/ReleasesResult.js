"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReleasesChannel = exports.ReleasesResult = void 0;
// ReleasesResult: Relevant data on current released runtime version.
// Required json format:
//    {
//       "releases-index": [ --> Array of release channels
//        {
//           "channel-version": "X.X", --> Major.Minor version this channel represents
//           "latest-runtime": "X.X.X", --> Most recently released full version of the runtime
//           "latest-sdk": "X.X.X", --> Most recently released full version of the SDK
//           ...
//        },
//        ...
//    }
class ReleasesResult {
    constructor(json) {
        const releasesJson = JSON.parse(json)['releases-index'];
        if (!releasesJson) {
            throw new Error('Unable to resolve version: invalid releases data');
        }
        this.releasesIndex = releasesJson.map((channel) => {
            const [channelVersion, latestRuntime, latestSDK] = [channel['channel-version'], channel['latest-runtime'], channel['latest-sdk']];
            if (!channelVersion || !latestRuntime || !latestSDK) {
                throw new Error('Unable to resolve version: invalid releases data');
            }
            return new ReleasesChannel(channelVersion, latestRuntime, latestSDK);
        });
    }
}
exports.ReleasesResult = ReleasesResult;
class ReleasesChannel {
    constructor(channelVersion, latestRuntime, latestSDK) {
        this.channelVersion = channelVersion;
        this.latestRuntime = latestRuntime;
        this.latestSDK = latestSDK;
    }
}
exports.ReleasesChannel = ReleasesChannel;
//# sourceMappingURL=ReleasesResult.js.map