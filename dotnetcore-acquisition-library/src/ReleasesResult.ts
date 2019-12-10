/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { isNullOrUndefined } from "util";

// ReleasesResult: Relevant data on current released runtime version. 
// Required json format:
//    {
//       "releases-index": [ --> Array of release channels
//        {
//           "channel-version": "X.X", --> Major.Minor version this channel represents
//           "latest-runtime": "X.X.X", --> Most recently released full version of the runtime
//           ...
//        }, 
//        ...
//    }
export class ReleasesResult {
   public releases_index: ReleasesChannel[];

   constructor(json: string) {
      this.releases_index = JSON.parse(json)['releases-index'];
      if (isNullOrUndefined(this.releases_index)) {
         throw new Error('Unable to resolve version: invalid releases data');
      }
      this.releases_index = this.releases_index.map((channel: any) => {
         if (isNullOrUndefined(channel['channel-version']) || isNullOrUndefined(channel['latest-runtime'])) {
            throw new Error('Unable to resolve version: invalid releases data');
         }
         return new ReleasesChannel(channel['channel-version'], channel['latest-runtime']);
      });
   }
}

export class ReleasesChannel {
   constructor(public channel_version: string,
               public latest_runtime: string) {}
}