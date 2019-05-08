/// <reference types="node" />
import { ExecException } from 'child_process';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
export declare class DotnetAcquisitionStarted implements IEvent {
    readonly version: string;
    readonly type = EventType.DotnetAcquisitionStart;
    constructor(version: string);
}
export declare abstract class DotnetAcquisitionError implements IEvent {
    readonly type = EventType.DotnetAcquisitionError;
    abstract getErrorMessage(): string;
}
export declare class DotnetAcquisitionUnexpectedError extends DotnetAcquisitionError {
    private readonly error;
    constructor(error: any);
    getErrorMessage(): string;
}
export declare class DotnetAcquisitionInstallError extends DotnetAcquisitionError {
    private readonly error;
    constructor(error: ExecException);
    getErrorMessage(): string;
}
export declare class DotnetAcquisitionScriptError extends DotnetAcquisitionError {
    private readonly error;
    constructor(error: string);
    getErrorMessage(): string;
}
export declare class DotnetAcquisitionCompleted implements IEvent {
    readonly dotnetPath: string;
    readonly type = EventType.DotnetAcquisitionCompleted;
    constructor(dotnetPath: string);
}
