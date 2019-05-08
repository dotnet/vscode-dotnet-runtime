import { EventStream } from './EventStream';
export declare class DotnetCoreAcquisitionWorker {
    private readonly extensionPath;
    private readonly eventStream;
    private readonly installDir;
    private readonly dotnetPath;
    private readonly scriptPath;
    private readonly lockFilePath;
    private readonly beginFilePath;
    private latestAcquisitionPromise;
    private acquisitionPromises;
    constructor(extensionPath: string, eventStream: EventStream);
    uninstallAll(): void;
    acquire(version: string): Promise<string>;
    private acquireCore;
    private installDotnet;
}
