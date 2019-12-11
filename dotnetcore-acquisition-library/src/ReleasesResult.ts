/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { isNullOrUndefined } from 'util';

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
   public releasesIndex: ReleasesChannel[];

   constructor(json: string) {
      this.releasesIndex = JSON.parse(json)['releases-index'];
      if (isNullOrUndefined(this.releasesIndex)) {
         throw new Error('Unable to resolve version: invalid releases data');
      }
      this.releasesIndex = this.releasesIndex.map((channel: any) => {
         if (isNullOrUndefined(channel['channel-version']) || isNullOrUndefined(channel['latest-runtime'])) {
            throw new Error('Unable to resolve version: invalid releases data');
         }
         return new ReleasesChannel(channel['channel-version'], channel['latest-runtime']);
      });
   }
}

export class ReleasesChannel {
   constructor(public channelVersion: string,
               public latestRuntime: string) {}
}
