import { IDotnetInstallationContext } from '../Acquisition/IDotnetInstallationContext';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
export declare class DotnetAcquisitionStarted extends IEvent {
    readonly version: string;
    readonly eventName = "DotnetAcquisitionStarted";
    readonly type = EventType.DotnetAcquisitionStart;
    constructor(version: string);
    getProperties(): {
        AcquisitionStartVersion: string;
    };
}
export declare class DotnetRuntimeAcquisitionStarted extends IEvent {
    readonly eventName = "DotnetRuntimeAcquisitionStarted";
    readonly type = EventType.DotnetRuntimeAcquisitionStart;
    getProperties(): undefined;
}
export declare class DotnetSDKAcquisitionStarted extends IEvent {
    readonly eventName = "DotnetSDKAcquisitionStarted";
    readonly type = EventType.DotnetSDKAcquisitionStart;
    getProperties(): undefined;
}
export declare class DotnetAcquisitionCompleted extends IEvent {
    readonly version: string;
    readonly dotnetPath: string;
    readonly eventName = "DotnetAcquisitionCompleted";
    readonly type = EventType.DotnetAcquisitionCompleted;
    constructor(version: string, dotnetPath: string);
    getProperties(telemetry?: boolean): {
        [key: string]: string;
    } | undefined;
}
export declare abstract class DotnetAcquisitionError extends IEvent {
    readonly error: Error;
    readonly type = EventType.DotnetAcquisitionError;
    isError: boolean;
    constructor(error: Error);
    getProperties(telemetry?: boolean): {
        [key: string]: string;
    } | undefined;
}
export declare class DotnetInstallScriptAcquisitionError extends DotnetAcquisitionError {
    readonly eventName = "DotnetInstallScriptAcquisitionError";
}
export declare class WebRequestError extends DotnetAcquisitionError {
    readonly eventName = "WebRequestError";
}
export declare class DotnetPreinstallDetectionError extends DotnetAcquisitionError {
    readonly eventName = "DotnetPreinstallDetectionError";
}
export declare class DotnetCommandFailed extends DotnetAcquisitionError {
    readonly command: string;
    readonly eventName = "DotnetCommandFailed";
    constructor(error: Error, command: string);
    getProperties(telemetry?: boolean): {
        [key: string]: string;
    } | undefined;
}
export declare abstract class DotnetAcquisitionVersionError extends DotnetAcquisitionError {
    readonly version: string;
    constructor(error: Error, version: string);
    getProperties(telemetry?: boolean): {
        [key: string]: string;
    } | undefined;
}
export declare class DotnetAcquisitionUnexpectedError extends DotnetAcquisitionVersionError {
    readonly eventName = "DotnetAcquisitionUnexpectedError";
}
export declare class DotnetAcquisitionInstallError extends DotnetAcquisitionVersionError {
    readonly eventName = "DotnetAcquisitionInstallError";
}
export declare class DotnetAcquisitionScriptError extends DotnetAcquisitionVersionError {
    readonly eventName = "DotnetAcquisitionScriptError";
}
export declare class DotnetOfflineFailure extends DotnetAcquisitionVersionError {
    readonly eventName = "DotnetOfflineFailure";
}
export declare class DotnetAcquisitionTimeoutError extends DotnetAcquisitionVersionError {
    readonly timeoutValue: number;
    readonly eventName = "DotnetAcquisitionTimeoutError";
    constructor(error: Error, version: string, timeoutValue: number);
    getProperties(telemetry?: boolean): {
        [key: string]: string;
    } | undefined;
}
export declare class DotnetVersionResolutionError extends DotnetAcquisitionVersionError {
    readonly eventName = "DotnetVersionResolutionError";
}
export declare class DotnetInstallationValidationError extends DotnetAcquisitionVersionError {
    readonly dotnetPath: string;
    readonly eventName = "DotnetInstallationValidationError";
    readonly fileStructure: string;
    constructor(error: Error, version: string, dotnetPath: string);
    getProperties(telemetry?: boolean): {
        [key: string]: string;
    } | undefined;
    private getFileStructure;
}
export declare abstract class DotnetAcquisitionSuccessEvent extends IEvent {
    readonly type = EventType.DotnetAcquisitionSuccessEvent;
    getProperties(): {
        [key: string]: string;
    } | undefined;
}
export declare class DotnetCommandSucceeded extends DotnetAcquisitionSuccessEvent {
    readonly commandName: string;
    readonly eventName = "DotnetCommandSucceeded";
    constructor(commandName: string);
    getProperties(): {
        CommandName: string;
    };
}
export declare class DotnetUninstallAllStarted extends DotnetAcquisitionSuccessEvent {
    readonly eventName = "DotnetUninstallAllStarted";
}
export declare class DotnetUninstallAllCompleted extends DotnetAcquisitionSuccessEvent {
    readonly eventName = "DotnetUninstallAllCompleted";
}
export declare class DotnetVersionResolutionCompleted extends DotnetAcquisitionSuccessEvent {
    readonly requestedVerion: string;
    readonly resolvedVersion: string;
    readonly eventName = "DotnetVersionResolutionCompleted";
    constructor(requestedVerion: string, resolvedVersion: string);
    getProperties(): {
        RequestedVersion: string;
        ResolvedVersion: string;
    };
}
export declare class DotnetInstallScriptAcquisitionCompleted extends DotnetAcquisitionSuccessEvent {
    readonly eventName = "DotnetInstallScriptAcquisitionCompleted";
}
export declare class DotnetExistingPathResolutionCompleted extends DotnetAcquisitionSuccessEvent {
    readonly resolvedPath: string;
    readonly eventName = "DotnetExistingPathResolutionCompleted";
    constructor(resolvedPath: string);
    getProperties(telemetry?: boolean): {
        ConfiguredPath: string;
    } | undefined;
}
export declare abstract class DotnetAcquisitionMessage extends IEvent {
    readonly type = EventType.DotnetAcquisitionMessage;
    getProperties(): {
        [key: string]: string;
    } | undefined;
}
export declare class DotnetAcquisitionDeletion extends DotnetAcquisitionMessage {
    readonly folderPath: string;
    readonly eventName = "DotnetAcquisitionDeletion";
    constructor(folderPath: string);
    getProperties(telemetry?: boolean): {
        DeletedFolderPath: string;
    } | undefined;
}
export declare class DotnetFallbackInstallScriptUsed extends DotnetAcquisitionMessage {
    readonly eventName = "DotnetFallbackInstallScriptUsed";
}
export declare class DotnetAcquisitionPartialInstallation extends DotnetAcquisitionMessage {
    readonly version: string;
    readonly eventName = "DotnetAcquisitionPartialInstallation";
    constructor(version: string);
    getProperties(): {
        PartialInstallationVersion: string;
    };
}
export declare class DotnetAcquisitionInProgress extends DotnetAcquisitionMessage {
    readonly version: string;
    readonly eventName = "DotnetAcquisitionInProgress";
    constructor(version: string);
    getProperties(): {
        InProgressInstallationVersion: string;
    };
}
export declare class DotnetAcquisitionAlreadyInstalled extends DotnetAcquisitionMessage {
    readonly version: string;
    readonly eventName = "DotnetAcquisitionAlreadyInstalled";
    constructor(version: string);
    getProperties(): {
        AlreadyInstalledVersion: string;
    };
}
export declare class DotnetAcquisitionMissingLinuxDependencies extends DotnetAcquisitionMessage {
    readonly eventName = "DotnetAcquisitionMissingLinuxDependencies";
}
export declare class DotnetAcquisitionScriptOuput extends DotnetAcquisitionMessage {
    readonly version: string;
    readonly output: string;
    readonly eventName = "DotnetAcquisitionScriptOuput";
    isError: boolean;
    constructor(version: string, output: string);
    getProperties(telemetry?: boolean): {
        [key: string]: string;
    } | undefined;
}
export declare class DotnetInstallationValidated extends DotnetAcquisitionMessage {
    readonly version: string;
    readonly eventName = "DotnetInstallationValidated";
    constructor(version: string);
    getProperties(telemetry?: boolean): {
        [key: string]: string;
    } | undefined;
}
export declare class DotnetAcquisitionRequested extends DotnetAcquisitionMessage {
    readonly version: string;
    readonly requestingId: string;
    readonly eventName = "DotnetAcquisitionRequested";
    constructor(version: string, requestingId?: string);
    getProperties(): {
        AcquisitionStartVersion: string;
        RequestingExtensionId: string;
    };
}
export declare class DotnetAcquisitionStatusRequested extends DotnetAcquisitionMessage {
    readonly version: string;
    readonly requestingId: string;
    readonly eventName = "DotnetAcquisitionStatusRequested";
    constructor(version: string, requestingId?: string);
    getProperties(): {
        AcquisitionStartVersion: string;
        RequestingExtensionId: string;
    };
}
export declare class DotnetAcquisitionStatusUndefined extends DotnetAcquisitionMessage {
    readonly version: string;
    readonly eventName = "DotnetAcquisitionStatusUndefined";
    constructor(version: string);
    getProperties(): {
        AcquisitionStatusVersion: string;
    };
}
export declare class DotnetAcquisitionStatusResolved extends DotnetAcquisitionMessage {
    readonly version: string;
    readonly eventName = "DotnetAcquisitionStatusResolved";
    constructor(version: string);
    getProperties(): {
        AcquisitionStatusVersion: string;
    };
}
export declare class WebRequestSent extends DotnetAcquisitionMessage {
    readonly url: string;
    readonly eventName = "WebRequestSent";
    constructor(url: string);
    getProperties(): {
        WebRequestUri: string;
    };
}
export declare class DotnetPreinstallDetected extends DotnetAcquisitionMessage {
    readonly version: string;
    readonly eventName = "DotnetPreinstallDetected";
    constructor(version: string);
    getProperties(): {
        PreinstalledVersion: string;
    };
}
export declare class TestAcquireCalled extends IEvent {
    readonly context: IDotnetInstallationContext;
    readonly eventName = "TestAcquireCalled";
    readonly type = EventType.DotnetAcquisitionTest;
    constructor(context: IDotnetInstallationContext);
    getProperties(): undefined;
}
