import { IEventStream } from '../EventStream/EventStream';
export declare abstract class IInstallationValidator {
    protected readonly eventStream: IEventStream;
    constructor(eventStream: IEventStream);
    abstract validateDotnetInstall(version: string, dotnetPath: string): void;
}
