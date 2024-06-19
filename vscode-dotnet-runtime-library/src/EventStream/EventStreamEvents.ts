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
import { InstallToStrings } from '../Acquisition/DotnetInstall';
import { DotnetInstall } from '../Acquisition/DotnetInstall';
import { DotnetInstallMode } from '../Acquisition/DotnetInstallMode';
import { DotnetInstallType } from '..';

// tslint:disable max-classes-per-file

export class EventCancellationError extends Error
{
    constructor(public readonly eventType : string, msg : string, stack ? : string)
    {
        super(msg);
    }
}

export class EventBasedError extends Error
{
    constructor(public readonly eventType : string, msg : string, stack? : string)
    {
        super(msg);
    }
}

export abstract class GenericModalEvent extends IEvent
{
    abstract readonly mode : DotnetInstallMode;
    abstract readonly installType : DotnetInstallType;
}

export class DotnetAcquisitionStarted extends GenericModalEvent
{
    public readonly eventName = 'DotnetAcquisitionStarted';
    public readonly type = EventType.DotnetAcquisitionStart;
    public readonly mode;
    public readonly installType: DotnetInstallType;

    constructor(public readonly install: DotnetInstall, public readonly startingVersion: string, public readonly requestingExtensionId = '') {
        super();
        this.mode = install.installMode;
        this.installType = install.isGlobal ? 'global' : 'local';
    }

    public getProperties() {
        return {
                ...InstallToStrings(this.install),
                AcquisitionStartVersion : this.startingVersion,
                AcquisitionInstallKey : this.install.installKey,
                extensionId : this.requestingExtensionId
            };
    }
}

abstract class DotnetAcquisitionStartedBase extends IEvent
{
    constructor(public readonly requestingExtensionId = '') {
        super();
    }

    public getProperties() {
        return {extensionId : TelemetryUtilities.HashData(this.requestingExtensionId)};
    }
}

export class DotnetRuntimeAcquisitionStarted extends DotnetAcquisitionStartedBase {
    public readonly eventName = 'DotnetRuntimeAcquisitionStarted';
    public readonly type = EventType.DotnetModalChildEvent;
}

export class DotnetSDKAcquisitionStarted extends DotnetAcquisitionStartedBase {
    public readonly eventName = 'DotnetSDKAcquisitionStarted';
    public readonly type = EventType.DotnetModalChildEvent;
}

export class DotnetGlobalSDKAcquisitionStarted extends DotnetAcquisitionStartedBase {
    public readonly eventName = 'DotnetGlobalSDKAcquisitionStarted';
    public readonly type = EventType.DotnetModalChildEvent;
}

export class DotnetASPNetRuntimeAcquisitionStarted extends DotnetAcquisitionStartedBase {
    public readonly eventName = 'DotnetASPNetRuntimeAcquisitionStarted';
    public readonly type = EventType.DotnetModalChildEvent;
}

export class DotnetAcquisitionTotalSuccessEvent extends GenericModalEvent
{
    public readonly type = EventType.DotnetTotalSuccessEvent;
    public readonly eventName = 'DotnetAcquisitionTotalSuccessEvent';
    public readonly mode;
    public readonly installType: DotnetInstallType;

    constructor(public readonly startingVersion: string, public readonly install: DotnetInstall, public readonly requestingExtensionId = '', public readonly finalPath: string) {
        super();
        this.mode = install.installMode;
        this.installType = install.isGlobal ? 'global' : 'local';
    }

    public getProperties() {
        return {
                AcquisitionStartVersion : this.startingVersion,
                AcquisitionInstallKey : this.install.installKey,
                ...InstallToStrings(this.install),
                ExtensionId : TelemetryUtilities.HashData(this.requestingExtensionId),
                FinalPath : this.finalPath,
            };
    }
}

abstract class DotnetAcquisitionTotalSuccessEventBase extends IEvent
{
    public readonly type = EventType.DotnetModalChildEvent;

    constructor(public readonly installKey: DotnetInstall) {
        super();
    }

    public getProperties() {
        return {
                ...InstallToStrings(this.installKey),
            };
    }
}

export class DotnetRuntimeAcquisitionTotalSuccessEvent extends DotnetAcquisitionTotalSuccessEventBase
{
    public readonly eventName = 'DotnetRuntimeAcquisitionTotalSuccessEvent';
}

export class DotnetGlobalSDKAcquisitionTotalSuccessEvent extends DotnetAcquisitionTotalSuccessEventBase
{
    public readonly eventName = 'DotnetGlobalSDKAcquisitionTotalSuccessEvent';
}

export class DotnetASPNetRuntimeAcquisitionTotalSuccessEvent extends DotnetAcquisitionTotalSuccessEventBase
{
    public readonly eventName = 'DotnetASPNetRuntimeAcquisitionTotalSuccessEvent';
}


export class DotnetAcquisitionRequested extends GenericModalEvent
{
    public readonly eventName = 'DotnetAcquisitionRequested';
    public readonly type = EventType.DotnetTotalSuccessEvent;
    public readonly mode;
    public readonly installType: DotnetInstallType;

    constructor(public readonly startingVersion: string, public readonly requestingId = '', mode : DotnetInstallMode, installType : DotnetInstallType)
    {
        super();
        this.mode = mode;
        this.installType = installType;
    }

    public getProperties() {
        return {AcquisitionStartVersion : this.startingVersion,
                RequestingExtensionId: TelemetryUtilities.HashData(this.requestingId)};
    }
}


abstract class DotnetAcquisitionRequestedEventBase extends IEvent
{
    public readonly type = EventType.DotnetModalChildEvent;

    constructor(public readonly startingVersion: string, public readonly requestingId = '', public readonly mode : DotnetInstallMode) {
        super();
    }

    public getProperties()
    {
        return {
            AcquisitionStartVersion : this.startingVersion,
            RequestingExtensionId: TelemetryUtilities.HashData(this.requestingId),
            Mode: this.mode
        };
    }
}

export class DotnetRuntimeAcquisitionRequested extends DotnetAcquisitionRequestedEventBase
{
    public readonly eventName = 'DotnetRuntimeAcquisitionRequested';
}

export class DotnetGlobalSDKAcquisitionRequested extends DotnetAcquisitionRequestedEventBase
{
    public readonly eventName = 'DotnetGlobalSDKAcquisitionRequested';
}

export class DotnetASPNetRuntimeAcquisitionRequested extends DotnetAcquisitionRequestedEventBase
{
    public readonly eventName = 'DotnetASPNetRuntimeAcquisitionRequested';
}


export class DotnetAcquisitionCompleted extends IEvent {
    public readonly eventName = 'DotnetAcquisitionCompleted';
    public readonly type = EventType.DotnetAcquisitionCompleted;

    constructor(public readonly install: DotnetInstall, public readonly dotnetPath: string, public readonly version: string) {
        super();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        if (telemetry) {
            return {...InstallToStrings(this.install),
                    AcquisitionCompletedInstallKey : this.install.installKey,
                    AcquisitionCompletedVersion: this.version};
        }
        else
        {
            return {...InstallToStrings(this.install),
                    AcquisitionCompletedVersion: this.version,
                    AcquisitionCompletedInstallKey : this.install.installKey,
                    AcquisitionCompletedDotnetPath : this.dotnetPath};
        }
    }
}

export abstract class DotnetAcquisitionError extends IEvent {
    public readonly type = EventType.DotnetAcquisitionError;
    public isError = true;

    /**
     *
     * @param error The error that triggered, so the call stack, etc. can be analyzed.
     * @param install For acquisition errors, you MUST include this install key. For commands unrelated to acquiring or managing a specific dotnet version, you
     * have the option to leave this parameter null. If it is NULL during acquisition the extension CANNOT properly manage what it has finished installing or not.
     */
    constructor(public readonly error: Error, public readonly install: DotnetInstall | null)
    {
        super();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorName : this.error.name,
                ErrorMessage : this.error.message,
                StackTrace : this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '',
                InstallKey : this.install?.installKey ?? 'null',
                ...InstallToStrings(this.install!)};
    }
}

export class DotnetAcquisitionFinalError extends GenericModalEvent
{
    public readonly type = EventType.DotnetTotalSuccessEvent;
    public readonly eventName = 'DotnetAcquisitionTotalSuccessEvent';
    public readonly mode;
    public readonly installType: DotnetInstallType;

    constructor(public readonly error: Error, public readonly originalEventName : string, public readonly install: DotnetInstall)
    {
        super();
        this.mode = install.installMode;
        this.installType = install.isGlobal ? 'global' : 'local';
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorName : this.error.name,
                ErrorMessage : this.error.message,
                StackTrace : this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '',
                InstallKey : this.install?.installKey ?? 'null',
                ...InstallToStrings(this.install!)};
    }
}

/**
 * @remarks A wrapper around events to detect them as a failure to install.
 * This allows us to count all errors and analyze them into categories.
 * The event name for the failure cause is stored in the originalEventName property.
 */
abstract class DotnetAcquisitionFinalErrorBase extends DotnetAcquisitionError
{
    constructor(public readonly error: Error, public readonly originalEventName : string, public readonly install: DotnetInstall)
    {
        super(error, install);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {
                FailureMode: this.originalEventName,
                ErrorName : this.error.name,
                ErrorMessage : this.error.message,
                StackTrace : this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '',
                InstallKey : this.install?.installKey ?? 'null',
                ...InstallToStrings(this.install!)
            };
    }
}

export class DotnetGlobalSDKAcquisitionError extends DotnetAcquisitionFinalErrorBase
{
    public eventName = 'DotnetGlobalSDKAcquisitionError';
}

export class DotnetRuntimeFinalAcquisitionError extends DotnetAcquisitionFinalErrorBase
{
    public eventName = 'DotnetRuntimeFinalAcquisitionError';
}

export class DotnetASPNetRuntimeFinalAcquisitionError extends DotnetAcquisitionFinalErrorBase
{
    public eventName = 'DotnetASPNetRuntimeFinalAcquisitionError';
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
     * @param install For acquisition errors, you MUST include this install key. For commands unrelated to acquiring or managing a specific dotnet version, you
     * have the option to leave this parameter null. If it is NULL during acquisition the extension CANNOT properly manage what it has finished installing or not.
     */
    constructor(public readonly error: Error, public readonly install: DotnetInstall | null)
    {
        super();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorName : this.error.name,
                ErrorMessage : this.error.message,
                StackTrace : this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '',
                InstallKey : this.install?.installKey ?? 'null',
                ...InstallToStrings(this.install)};
    }
}

export class SuppressedAcquisitionError extends IEvent {
    public eventName = 'SuppressedAcquisitionError';
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

export class UserManualInstallFailure extends SuppressedAcquisitionError {
    eventName = 'UserManualInstallFailure';
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

    constructor(error: Error, public readonly command: string, install : DotnetInstall | null) {
        super(error, install);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            CommandName : this.command,
            ErrorName : this.error.name,
            StackTrace : this.error.stack ? this.error.stack : '',
            InstallKey : this.install?.installKey ?? 'null',
            ...InstallToStrings(this.install!)};
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
    constructor(error: Error, public readonly install: DotnetInstall | null) {
        super(error, install);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            AcquisitionErrorInstallKey : this.install?.installKey ?? 'null',
            ...InstallToStrings(this.install!),
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

    constructor(error: Error, installKey: DotnetInstall | null, public readonly timeoutValue: number) {
        super(error, installKey);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            TimeoutValue : this.timeoutValue.toString(),
            ...InstallToStrings(this.install),
            ErrorName : this.error.name,
            StackTrace : this.error.stack ? this.error.stack : ''};
    }
}

export class DotnetVersionResolutionError extends DotnetInstallExpectedAbort {
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
    constructor(error: Error, install: DotnetInstall | null, public readonly dotnetPath: string) {
        super(error, install);
        this.fileStructure = this.getFileStructure();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            AcquisitionErrorInstallKey : this.install?.installKey ?? 'null',
            InstallKey : this.install?.installKey ?? 'null',
            ...InstallToStrings(this.install),
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
            InstallKey : this.install?.installKey ?? 'null',
            ...InstallToStrings(this.install!)};
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
        return {};
    }
}

export class DotnetAcquisitionDeletion extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionDeletion';
    constructor(public readonly folderPath: string) { super(); }

    public getProperties(telemetry = false)
    {
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

export class DuplicateInstallDetected extends DotnetCustomMessageEvent {
    public readonly eventName = 'DuplicateInstallDetected';
}

export class NoExtensionIdProvided extends DotnetCustomMessageEvent {
    public readonly eventName = 'NoExtensionIdProvided';
}


export class ConvertingLegacyInstallRecord extends DotnetCustomMessageEvent {
    public readonly eventName = 'ConvertingLegacyInstallRecord';
}
export class FoundTrackingVersions extends DotnetCustomMessageEvent {
    public readonly eventName = 'FoundTrackingVersions';
}
export class RemovingVersionFromExtensionState extends DotnetCustomMessageEvent {
    public readonly eventName = 'RemovingVersionFromExtensionState';
}

export class RemovingExtensionFromList extends DotnetCustomMessageEvent {
    public readonly eventName = 'RemovingExtensionFromList';
}

export class RemovingOwnerFromList extends DotnetCustomMessageEvent {
    public readonly eventName = 'RemovingOwnerFromList';
}

export class SkipAddingInstallEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'SkipAddingInstallEvent';
}

export class AddTrackingVersions extends DotnetCustomMessageEvent {
    public readonly eventName = 'AddTrackingVersions';
}

export class DotnetWSLCheckEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetWSLCheckEvent';
}

export class DotnetWSLOperationOutputEvent extends DotnetCustomMessageEvent {
    public readonly eventName = 'DotnetWSLOperationOutputEvent';
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

export class GlobalAcquisitionContextMenuOpened extends DotnetCustomMessageEvent {
    public readonly eventName = 'GlobalAcquisitionContextMenuOpened';
}

export class UserManualInstallVersionChosen extends DotnetCustomMessageEvent {
    public readonly eventName = 'UserManualInstallVersionChosen';
}

export class UserManualInstallRequested extends DotnetCustomMessageEvent {
    public readonly eventName = 'UserManualInstallRequested';
}

export class UserManualInstallSuccess extends DotnetCustomMessageEvent {
    public readonly eventName = 'UserManualInstallSuccess';
}

export class CommandExecutionStdOut extends DotnetCustomMessageEvent {
    public readonly eventName = 'CommandExecutionStdOut';
}

export class NoMatchingInstallToStopTracking extends DotnetCustomMessageEvent {
    public readonly eventName = 'NoMatchingInstallToStopTracking';
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
    constructor(public readonly install: DotnetInstall) { super(); }

    public getProperties() {
        return {
            ...InstallToStrings(this.install!),
            PartialInstallationInstallKey: this.install.installKey
        };
    }
}

export class DotnetAcquisitionInProgress extends IEvent {
    public readonly type = EventType.DotnetAcquisitionInProgress;

    public readonly eventName = 'DotnetAcquisitionInProgress';
    constructor(public readonly installKey: DotnetInstall, public readonly requestingExtensionId: string | null) { super(); }

    public getProperties() {
        return {
            InProgressInstallationInstallKey : this.installKey.installKey,
            ...InstallToStrings(this.installKey!),
            extensionId : TelemetryUtilities.HashData(this.requestingExtensionId)};
    }
}

export class DotnetAcquisitionAlreadyInstalled extends IEvent {
    public readonly eventName = 'DotnetAcquisitionAlreadyInstalled';
    public readonly type = EventType.DotnetAcquisitionAlreadyInstalled;

    constructor(public readonly install: DotnetInstall, public readonly requestingExtensionId: string | null) { super(); }

    public getProperties() {
        return {...InstallToStrings(this.install),
            extensionId : TelemetryUtilities.HashData(this.requestingExtensionId)};
    }
}

export class DotnetAcquisitionMissingLinuxDependencies extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionMissingLinuxDependencies';
}


export class DotnetAcquisitionScriptOutput extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionScriptOutput';
    public isError = true;
    constructor(public readonly install: DotnetInstall, public readonly output: string) { super(); }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {
            AcquisitionInstallKey : this.install.installKey,
            ...InstallToStrings(this.install!),
                ScriptOutput: this.output
            };
    }
}

export class DotnetInstallationValidated extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetInstallationValidated';
    constructor(public readonly install: DotnetInstall) { super(); }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {
            ValidatedInstallKey : this.install.installKey,
            ...InstallToStrings(this.install!)
        };
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

    constructor(public readonly installKey: DotnetInstall) {
        super();
    }

    public getProperties() {
        return {
            AcquisitionStatusInstallKey : this.installKey.installKey,
            ...InstallToStrings(this.installKey!)
        };
    }
}

export class DotnetAcquisitionStatusResolved extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionStatusResolved';

    constructor(public readonly installKey: DotnetInstall, public readonly version: string) {
        super();
    }

    public getProperties() {
        return {
            AcquisitionStatusInstallKey : this.installKey.installKey,
            ...InstallToStrings(this.installKey!),
            AcquisitionStatusVersion : this.version
            };
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
    constructor(public readonly installKey: DotnetInstall) { super(); }

    public getProperties() {
        return {
            ...InstallToStrings(this.installKey!),
            PreinstalledInstallKey : this.installKey.installKey
            };
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
