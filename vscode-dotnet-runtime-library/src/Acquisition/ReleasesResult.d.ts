export declare class ReleasesResult {
    releasesIndex: ReleasesChannel[];
    constructor(json: string);
}
export declare class ReleasesChannel {
    channelVersion: string;
    latestRuntime: string;
    latestSDK: string;
    constructor(channelVersion: string, latestRuntime: string, latestSDK: string);
}
