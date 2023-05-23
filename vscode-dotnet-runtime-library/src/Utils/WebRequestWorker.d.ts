import { IEventStream } from '../EventStream/EventStream';
import { IExtensionState } from '../IExtensionState';
export declare class WebRequestWorker {
    private readonly extensionState;
    private readonly eventStream;
    private cachedData;
    private currentRequest;
    constructor(extensionState: IExtensionState, eventStream: IEventStream);
    getCachedData(url: string, retriesCount?: number): Promise<string | undefined>;
    protected makeWebRequest(url: string, throwOnError: boolean): Promise<string | undefined>;
    protected cacheResults(url: string, response: string): Promise<void>;
    private makeWebRequestWithRetries;
    private delay;
}
