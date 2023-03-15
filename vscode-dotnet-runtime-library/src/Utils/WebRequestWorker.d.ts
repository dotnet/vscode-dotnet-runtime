import { IEventStream } from '../EventStream/EventStream';
import { IExtensionState } from '../IExtensionState';
export declare class WebRequestWorker {
    private readonly extensionState;
    private readonly eventStream;
    private readonly url;
    private readonly extensionStateKey;
    private cachedData;
    private currentRequest;
    constructor(extensionState: IExtensionState, eventStream: IEventStream, url: string, extensionStateKey: string);
    getCachedData(retriesCount?: number): Promise<string | undefined>;
    protected makeWebRequest(throwOnError: boolean): Promise<string | undefined>;
    protected cacheResults(response: string): Promise<void>;
    private makeWebRequestWithRetries;
    private delay;
}
