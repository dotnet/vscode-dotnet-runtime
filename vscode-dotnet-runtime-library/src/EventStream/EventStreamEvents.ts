/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import { IDotnetInstallationContext } from '../Acquisition/IDotnetInstallationContext';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
import { TelemetryUtilities } from './TelemetryUtilities';

// tslint:disable max-classes-per-file

export class DotnetAcquisitionStarted extends IEvent {
    public readonly eventName = 'DotnetAcquisitionStarted';
    public readonly type = EventType.DotnetAcquisitionStart;

    constructor(public readonly installKey: string, public readonly startingVersion: string, public readonly requestingExtensionId = '') {
        super();
    }

    public getProperties() {
        return {AcquisitionInstallKey : this.installKey,
                AcquisitionStartVersion : this.startingVersion,
                extensionId : TelemetryUtilities.HashData(this.requestingExtensionId)};
    }
}

export class DotnetRuntimeAcquisitionStarted extends IEvent {
    public readonly eventName = 'DotnetRuntimeAcquisitionStarted';
    public readonly type = EventType.DotnetRuntimeAcquisitionStart;

    constructor(public readonly requestingExtensionId = '') {
        super();
    }

    public getProperties() {
        return {extensionId : TelemetryUtilities.HashData(this.requestingExtensionId)};
    }
}

export class DotnetSDKAcquisitionStarted extends IEvent {
    public readonly eventName = 'DotnetSDKAcquisitionStarted';
    public readonly type = EventType.DotnetSDKAcquisitionStart;

    constructor(public readonly requestingExtensionId = '') {
        super();
    }

    public getProperties() {
        return {extensionId : TelemetryUtilities.HashData(this.requestingExtensionId)};
    }
}

export class DotnetAcquisitionCompleted extends IEvent {
    public readonly eventName = 'DotnetAcquisitionCompleted';
    public readonly type = EventType.DotnetAcquisitionCompleted;

    constructor(public readonly installKey: string, public readonly dotnetPath: string, public readonly version: string) {
        super();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        if (telemetry) {
            return {AcquisitionCompletedInstallKey : this.installKey,
                    AcquisitionCompletedVersion: this.version};
        } else {
            return {AcquisitionCompletedInstallKey : this.installKey,
                    AcquisitionCompletedVersion: this.version,
                    AcquisitionCompletedDotnetPath : this.dotnetPath};
        }

    }
}

export class DotnetRuntimeAcquisitionTotalSuccessEvent extends IEvent
{
    public readonly eventName = 'DotnetRuntimeAcquisitionTotalSuccessEvent';
    public readonly type = EventType.DotnetTotalSuccessEvent;


    constructor(public readonly startingVersion: string, public readonly installKey: string, public readonly requestingExtensionId = '', public readonly finalPath: string) {
        super();
    }

    public getProperties() {
        return {
                AcquisitionStartVersion : this.startingVersion,
                AcquisitionInstallKey : this.installKey,
                ExtensionId : TelemetryUtilities.HashData(this.requestingExtensionId),
                FinalPath : this.finalPath,
            };
    }
}

export abstract class DotnetAcquisitionError extends IEvent {
    public readonly type = EventType.DotnetAcquisitionError;
    public isError = true;

    /**
     *
     * @param error The error that triggered, so the call stack, etc. can be analyzed.
     * @param installKey For acquisition errors, you MUST include this install key. For commands unrelated to acquiring or managing a specific dotnet version, you
     * have the option to leave this parameter null. If it is NULL during acquisition the extension CANNOT properly manage what it has finished installing or not.
     */
    constructor(public readonly error: Error, public readonly installKey: string | null)
    {
        super();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorName : this.error.name,
                ErrorMessage : this.error.message,
                StackTrace : this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '',
                InstallKey : this.installKey ?? 'null'};
    }
}

export abstract class DotnetNonAcquisitionError extends IEvent {
    public readonly type = EventType.DotnetAcquisitionError;
    public isError = true;

    constructor(public readonly error: Error) {
        super();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorName : this.error.name,
                ErrorMessage : this.error.message,
                StackTrace : this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : ''};
    }
}

export abstract class DotnetInstallExpectedAbort extends IEvent {
    public readonly type = EventType.DotnetInstallExpectedAbort;
    public isError = true;

    /**
     *
     * @param error The error that triggered, so the call stack, etc. can be analyzed.
     * @param installKey For acquisition errors, you MUST include this install key. For commands unrelated to acquiring or managing a specific dotnet version, you
     * have the option to leave this parameter null. If it is NULL during acquisition the extension CANNOT properly manage what it has finished installing or not.
     */
    constructor(public readonly error: Error, public readonly installKey: string | null)
    {
        super();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorName : this.error.name,
                ErrorMessage : this.error.message,
                StackTrace : this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '',
                InstallKey : this.installKey ?? 'null'};
    }
}

export class SuppressedAcquisitionError extends IEvent {
    public readonly eventName = 'SuppressedAcquisitionError';
    public readonly type = EventType.SuppressedAcquisitionError;

    constructor(public readonly error: Error, public readonly supplementalMessage : string) {
        super();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {
                SupplementMessage : this.supplementalMessage,
                ErrorName : this.error.name,
                ErrorMessage : telemetry ? 'redacted' : TelemetryUtilities.HashAllPaths(this.error.message),
                StackTrace : telemetry ? 'redacted' : (this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '')};
    }
}

export class DotnetInstallScriptAcquisitionError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetInstallScriptAcquisitionError';
}

export class OSXOpenNotAvailableError extends DotnetAcquisitionError {
    public readonly eventName = 'OSXOpenNotAvailableError';
}

export class WebRequestError extends DotnetAcquisitionError {
    public readonly eventName = 'WebRequestError';
}

export class DotnetPreinstallDetectionError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetPreinstallDetectionError';
}

export class TimeoutSudoProcessSpawnerError extends DotnetAcquisitionError {
    public readonly eventName = 'TimeoutSudoProcessSpawnerError';
}

export class TimeoutSudoCommandExecutionError extends DotnetAcquisitionError {
    public readonly eventName = 'TimeoutSudoCommandExecutionError';
}

export class CommandExecutionNonZeroExitFailure extends DotnetAcquisitionError {
    public readonly eventName = 'CommandExecutionNonZeroExitFailure';
}

export class DotnetNotInstallRelatedCommandFailed extends DotnetNonAcquisitionError {
    public readonly eventName = 'DotnetNotInstallRelatedCommandFailed';

    constructor(error: Error, public readonly command: string) {
        super(error);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {
            ErrorMessage : this.error.message,
            CommandName : this.command,
            ErrorName : this.error.name,
            StackTrace : this.error.stack ? this.error.stack : ''};
        }
}

export class DotnetCommandFailed extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetCommandFailed';

    constructor(error: Error, public readonly command: string, installKey : string | null) {
        super(error, installKey);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            CommandName : this.command,
            ErrorName : this.error.name,
            StackTrace : this.error.stack ? this.error.stack : '',
            InstallKey : this.installKey ?? 'null'};
        }
}

export class DotnetInvalidReleasesJSONError extends DotnetAcquisitionError {
        public readonly eventName = 'DotnetInvalidReleasesJSONError';
}

export class DotnetNoInstallerFileExistsError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetNoInstallerFileExistsError';
}

export class DotnetUnexpectedInstallerOSError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetUnexpectedInstallerOSError';
}

export class DotnetUnexpectedInstallerArchitectureError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetUnexpectedInstallerArchitectureError';
}

export class DotnetFeatureBandDoesNotExistError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetFeatureBandDoesNotExistError';
}

export class DotnetWSLSecurityError extends DotnetInstallExpectedAbort {
    public readonly eventName = 'DotnetWSLSecurityError';
}


export abstract class DotnetAcquisitionVersionError extends DotnetAcquisitionError {
    constructor(error: Error, public readonly installKey: string | null) {
        super(error, installKey);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            AcquisitionErrorInstallKey : this.installKey ?? 'null',
            ErrorName : this.error.name,
            StackTrace : this.error.stack ? this.error.stack : ''};
        }
    }

export class DotnetAcquisitionUnexpectedError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetAcquisitionUnexpectedError';
}

export class DotnetAcquisitionInstallError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetAcquisitionInstallError';
}

export class DotnetAcquisitionScriptError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetAcquisitionScriptError';
}

export class DotnetConflictingGlobalWindowsInstallError extends DotnetInstallExpectedAbort {
    public readonly eventName = 'DotnetConflictingGlobalWindowsInstallError';
}

export class DotnetInstallCancelledByUserError extends DotnetInstallExpectedAbort {
    public readonly eventName = 'DotnetInstallCancelledByUserError';
}

export class DotnetDebuggingMessage extends IEvent {
    public readonly eventName = 'DotnetDebuggingMessage';
    public readonly type = EventType.DotnetDebuggingMessage;

    constructor(public readonly message: string) {
        super();
        this.message = message;
    }

    public getProperties() {
        return { message : this.message };
    }
}

export class DotnetNonZeroInstallerExitCodeError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetNonZeroInstallerExitCodeError';
}

export class DotnetOfflineFailure extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetOfflineFailure';
}

export class DotnetAcquisitionTimeoutError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetAcquisitionTimeoutError';

    constructor(error: Error, installKey: string | null, public readonly timeoutValue: number) {
        super(error, installKey);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            TimeoutValue : this.timeoutValue.toString(),
            InstallKey : this.installKey ?? 'null',
            ErrorName : this.error.name,
            StackTrace : this.error.stack ? this.error.stack : ''};
    }
}

export class DotnetVersionResolutionError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetVersionResolutionError';
}

export class DotnetConflictingLinuxInstallTypesError extends DotnetInstallExpectedAbort {
    public readonly eventName = 'DotnetConflictingLinuxInstallTypesError';
}

export class DotnetCustomLinuxInstallExistsError extends DotnetInstallExpectedAbort {
    public readonly eventName = 'DotnetCustomLinuxInstallExistsError';
}

export class DotnetInstallationValidationError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetInstallationValidationError';
    public readonly fileStructure: string;
    constructor(error: Error, installKey: string | null, public readonly dotnetPath: string) {
        super(error, installKey);
        this.fileStructure = this.getFileStructure();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            AcquisitionErrorInstallKey : this.installKey ?? 'null',
            ErrorName : this.error.name,
            StackTrace : this.error.stack ? this.error.stack : '',
            FileStructure : this.fileStructure};
    }

    private getFileStructure(): string {
        const folderPath = path.dirname(this.dotnetPath);
        if (!fs.existsSync(folderPath)) {
            return `Dotnet Path (${ path.basename(folderPath) }) does not exist`;
        }
        // Get 2 levels worth of content of the folder
        let files = fs.readdirSync(folderPath).map(file => path.join(folderPath, file));
        for (const file of files) {
            if (fs.statSync(file).isDirectory()) {
                files = files.concat(fs.readdirSync(file).map(fileName => path.join(file, fileName)));
            }
        }
        const relativeFiles: string[] = [];
        for (const file of files) {
            relativeFiles.push(path.relative(path.dirname(folderPath), file));
        }

        return relativeFiles.join('\n');
    }
}

export class DotnetAcquisitionDistroUnknownError extends DotnetInstallExpectedAbort {
    public readonly eventName = 'DotnetAcquisitionDistroUnknownError';

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            ErrorName : this.error.name,
            StackTrace : this.error.stack ? this.error.stack : '',
            InstallKey : this.installKey ?? 'null'};
    }
}


export abstract class DotnetAcquisitionSuccessEvent extends IEvent {
    public readonly type = EventType.DotnetAcquisitionSuccessEvent;

    public getProperties(): { [key: string]: string } | undefined {
        return undefined;
    }
}

export class DotnetCommandSucceeded extends DotnetAcquisitionSuccessEvent {
    public readonly eventName = 'DotnetCommandSucceeded';

    constructor(public readonly commandName: string) { super(); }

    public getProperties() {
        return {CommandName : this.commandName};
    }
}

export class DotnetUninstallAllStarted extends DotnetAcquisitionSuccessEvent {
    public readonly eventName = 'DotnetUninstallAllStarted';
}

export class DotnetUninstallAllCompleted extends DotnetAcquisitionSuccessEvent {
    public readonly eventName = 'DotnetUninstallAllCompleted';
}

export class DotnetVersionResolutionCompleted extends DotnetAcquisitionSuccessEvent {
    public readonly eventName = 'DotnetVersionResolutionCompleted';

    constructor(public readonly requestedVersion: string, public readonly resolvedVersion: string) { super(); }

    public getProperties() {
        return {RequestedVersion : this.requestedVersion,
                ResolvedVersion : this.resolvedVersion};
    }
}

export class DotnetInstallScriptAcquisitionCompleted extends DotnetAcquisitionSuccessEvent {
    public readonly eventName = 'DotnetInstallScriptAcquisitionCompleted';
}

export class DotnetExistingPathResolutionCompleted extends DotnetAcquisitionSuccessEvent {
    public readonly eventName = 'DotnetExistingPathResolutionCompleted';

    constructor(public readonly resolvedPath: string) { super(); }

    public getProperties(telemetry = false) {
        return telemetry ? undefined : { ConfiguredPath : this.resolvedPath};
    }
}

export abstract class DotnetAcquisitionMessage extends IEvent {
    public type = EventType.DotnetAcquisitionMessage;

    public getProperties(): { [key: string]: string } | undefined {
        return undefined;
    }
}

export class DotnetAcquisitionDeletion extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionDeletion';
    constructor(public readonly folderPath: string) { super(); }

    public getProperties(telemetry = false) {
        return telemetry ? undefined : {DeletedFolderPath : this.folderPath};
    }
}

export class DotnetFallbackInstallScriptUsed extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetFallbackInstallScriptUsed';
}

export abstract class DotnetCustomMessageEvent extends DotnetAcquisitionMessage {
    constructor(public readonly eventMessage: string) { super(); }

    public getProperties() {
        return { Message: this.eventMessage };
    }
}

export class DotnetVersionCategorizedEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetVersionCategorizedEvent';
}

export class DotnetTelemetrySettingEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetTelemetrySettingEvent';
}

export class DotnetCommandNotFoundEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetCommandNotFoundEvent';
}

export class DotnetFileIntegrityCheckEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetFileIntegrityCheckEvent';
}

export class CommandExecutionStdOut extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandExecutionStdOut';
}

export class CommandExecutionStdError extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandExecutionStdError';
}

export class DotnetGlobalAcquisitionBeginEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetGlobalAcquisitionBeginEvent';
}

export class DotnetGlobalVersionResolutionCompletionEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetGlobalVersionResolutionCompletionEvent';
}

export class CommandProcessesExecutionFailureNonTerminal extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandProcessesExecutionFailureNonTerminal';
}

export class CommandProcessorExecutionBegin extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandProcessorExecutionBegin';
}

export class CommandProcessorExecutionEnd extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandProcessorExecutionEnd';
}

export class DotnetBeginGlobalInstallerExecution extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetBeginGlobalInstallerExecution';
}

export class DotnetCompletedGlobalInstallerExecution extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetCompletedGlobalInstallerExecution';
}

export class DotnetGlobalAcquisitionCompletionEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetGlobalAcquisitionCompletionEvent';
}
export class DotnetInstallGraveyardEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetInstallGraveyardEvent';
}

export class DotnetAlternativeCommandFoundEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetAlternativeCommandFoundEvent';
}

export class DotnetCommandFallbackArchitectureEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetCommandFallbackArchitectureEvent';
}

export class DotnetCommandFallbackOSEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetCommandFallbackOSEvent';
}

export class DotnetInstallKeyCreatedEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetInstallKeyCreatedEvent';
}

export class DotnetLegacyInstallDetectedEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetLegacyInstallDetectedEvent';
}

export class DotnetLegacyInstallRemovalRequestEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetLegacyInstallRemovalRequestEvent';
}

export class DotnetFakeSDKEnvironmentVariableTriggered extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetFakeSDKEnvironmentVariableTriggered';
}

export class CommandExecutionNoStatusCodeWarning extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandExecutionNoStatusCodeWarning';
}

export class CommandExecutionSignalSentEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandExecutionSignalSentEvent';
}

export class CommandExecutionStatusEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandExecutionStatusEvent';
}

export class CommandExecutionEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandExecutionEvent';
}

export class SudoProcAliveCheckBegin extends DotnetCustomMessageEvent {
    public readonly eventName = 'SudoProcAliveCheckBegin';
}

export class SudoProcAliveCheckEnd extends DotnetCustomMessageEvent {
    public readonly eventName = 'SudoProcAliveCheckEnd';
}

export class SudoProcCommandExchangeBegin extends DotnetCustomMessageEvent {
    public readonly eventName = 'SudoProcCommandExchangeBegin';
}

export class SudoProcCommandExchangePing extends DotnetCustomMessageEvent {
    public readonly eventName = 'SudoProcCommandExchangePing';
}

export class SudoProcCommandExchangeEnd extends DotnetCustomMessageEvent {
    public readonly eventName = 'SudoProcCommandExchangeEnd';
}

export class CommandExecutionUserAskDialogueEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandExecutionUserAskDialogueEvent';
}

export class CommandExecutionUserCompletedDialogueEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandExecutionUserCompletedDialogueEvent';
}

export class CommandExecutionUnderSudoEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandExecutionUnderSudoEvent';
}

export class CommandExecutionUserRejectedPasswordRequest extends DotnetInstallExpectedAbort {
    public readonly eventName = 'CommandExecutionUserRejectedPasswordRequest';
}

export class CommandExecutionUnknownCommandExecutionAttempt extends DotnetInstallExpectedAbort {
    public readonly eventName = 'CommandExecutionUnknownCommandExecutionAttempt';
}

export class DotnetVersionParseEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetVersionParseEvent';
}

export class DotnetUpgradedEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetUpgradedEvent';
    constructor(eventMsg : string)
    {
        super(eventMsg);
        this.type = EventType.DotnetUpgradedEvent;
    }
}

export class NetInstallerBeginExecutionEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'NetInstallerBeginExecutionEvent';
}

export class NetInstallerEndExecutionEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'NetInstallerEndExecutionEvent';
}


export class DotnetInstallLinuxChecks extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetInstallLinuxChecks';
}

export abstract class DotnetFileEvent extends DotnetAcquisitionMessage
{
    constructor(public readonly eventMessage: string, public readonly time: string, public readonly file: string) { super(); }

    public getProperties() {
        return {Message: this.eventMessage, Time: this.time, File: TelemetryUtilities.HashData(this.file)};
    }
}

export abstract class DotnetLockEvent extends DotnetFileEvent
{
    constructor(public readonly eventMessage: string, public readonly time: string, public readonly lock: string, public readonly file: string) { super(eventMessage, time, file); }

    public getProperties() {
        return {Message: this.eventMessage, Time: this.time, Lock: TelemetryUtilities.HashData(this.lock), File: TelemetryUtilities.HashData(this.file)};
    }
}

export class DotnetLockAcquiredEvent extends DotnetLockEvent {
    public readonly eventName = 'DotnetLockAcquiredEvent';
}

export class DotnetLockReleasedEvent extends DotnetLockEvent {
    public readonly eventName = 'DotnetLockReleasedEvent';
}

export class DotnetLockErrorEvent extends DotnetLockEvent {
    public readonly eventName = 'DotnetLockErrorEvent';
    constructor(public readonly error : Error,
        public readonly eventMessage: string, public readonly time: string, public readonly lock: string, public readonly file: string) { super(eventMessage, time, lock, file); }

    public getProperties() {
        return {Error: this.error.toString(), Message: this.eventMessage, Time: this.time, Lock: TelemetryUtilities.HashData(this.lock), File: TelemetryUtilities.HashData(this.file)};
    }

}

export class DotnetLockAttemptingAcquireEvent extends DotnetLockEvent {
    public readonly eventName = 'DotnetLockAttemptingAcquireEvent';
}

export class DotnetFileWriteRequestEvent extends DotnetFileEvent {
    public readonly eventName = 'DotnetFileWriteRequestEvent';
}

export class DotnetAcquisitionPartialInstallation extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionPartialInstallation';
    constructor(public readonly installKey: string) { super(); }

    public getProperties() {
        return {PartialInstallationInstallKey: this.installKey};
    }
}

export class DotnetAcquisitionInProgress extends IEvent {
    public readonly type = EventType.DotnetAcquisitionInProgress;

    public readonly eventName = 'DotnetAcquisitionInProgress';
    constructor(public readonly installKey: string, public readonly requestingExtensionId: string | null) { super(); }

    public getProperties() {
        return {InProgressInstallationInstallKey : this.installKey, extensionId : TelemetryUtilities.HashData(this.requestingExtensionId)};
    }
}

export class DotnetAcquisitionAlreadyInstalled extends IEvent {
    public readonly eventName = 'DotnetAcquisitionAlreadyInstalled';
    public readonly type = EventType.DotnetAcquisitionAlreadyInstalled;

    constructor(public readonly installKey: string, public readonly requestingExtensionId: string | null) { super(); }

    public getProperties() {
        return {AlreadyInstalledInstallKey : this.installKey, extensionId : TelemetryUtilities.HashData(this.requestingExtensionId)};
    }
}

export class DotnetAcquisitionMissingLinuxDependencies extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionMissingLinuxDependencies';
}

export class DotnetAcquisitionScriptOutput extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionScriptOutput';
    public isError = true;
    constructor(public readonly installKey: string, public readonly output: string) { super(); }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {AcquisitionInstallKey : this.installKey,
                ScriptOutput: this.output};
    }
}

export class DotnetInstallationValidated extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetInstallationValidated';
    constructor(public readonly installKey: string) { super(); }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ValidatedInstallKey : this.installKey};
    }
}

export class DotnetAcquisitionRequested extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionRequested';

    constructor(public readonly startingVersion: string,
                public readonly requestingId = '') {
        super();
    }

    public getProperties() {
        return {AcquisitionStartVersion : this.startingVersion,
                RequestingExtensionId: TelemetryUtilities.HashData(this.requestingId)};
    }
}

export class DotnetAcquisitionStatusRequested extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionStatusRequested';

    constructor(public readonly version: string,
                public readonly requestingId = '') {
        super();
    }

    public getProperties() {
        return {AcquisitionStartVersion : this.version,
                RequestingExtensionId: TelemetryUtilities.HashData(this.requestingId)};
    }
}

export class DotnetAcquisitionStatusUndefined extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionStatusUndefined';

    constructor(public readonly installKey: string) {
        super();
    }

    public getProperties() {
        return {AcquisitionStatusInstallKey : this.installKey};
    }
}

export class DotnetAcquisitionStatusResolved extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionStatusResolved';

    constructor(public readonly installKey: string, public readonly version: string) {
        super();
    }

    public getProperties() {
        return {AcquisitionStatusInstallKey : this.installKey,
                AcquisitionStatusVersion : this.version};
    }
}

export class WebRequestSent extends DotnetAcquisitionMessage {
    public readonly eventName = 'WebRequestSent';

    constructor(public readonly url: string) {
        super();
    }

    public getProperties() {
        return {WebRequestUri : this.url};
    }
}

export class DotnetPreinstallDetected extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetPreinstallDetected';
    constructor(public readonly installKey: string) { super(); }

    public getProperties() {
        return {PreinstalledInstallKey : this.installKey};
    }
}

export class TestAcquireCalled extends IEvent {
    public readonly eventName = 'TestAcquireCalled';
    public readonly type = EventType.DotnetAcquisitionTest;

    constructor(public readonly context: IDotnetInstallationContext) {
        super();
    }

    public getProperties() {
        return undefined;
    }
}
