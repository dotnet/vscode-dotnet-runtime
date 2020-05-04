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
      const releasesJson = JSON.parse(json)['releases-index'];
      if (isNullOrUndefined(releasesJson)) {
         throw new Error('Unable to resolve version: invalid releases data');
      }
      this.releasesIndex = releasesJson.map((channel: IReleasesChannel) => {
         const [ channelVersion, latestRuntime ] = [ channel['channel-version'], channel['latest-runtime'] ];
         if (isNullOrUndefined(channelVersion) || isNullOrUndefined(latestRuntime)) {
            throw new Error('Unable to resolve version: invalid releases data');
         }
         return new ReleasesChannel(channelVersion, latestRuntime);
      });
   }
}

export class ReleasesChannel {
   constructor(public channelVersion: string,
               public latestRuntime: string) { }
}

interface IReleasesChannel {
   ['channel-version']: string;
   ['latest-runtime']: string;
}
