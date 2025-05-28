/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import { DotnetInstall, InstallToStrings } from '../Acquisition/DotnetInstall';
import { DotnetInstallMode } from '../Acquisition/DotnetInstallMode';
import { IDotnetInstallationContext } from '../Acquisition/IDotnetInstallationContext';
import { DotnetInstallType } from '../IDotnetAcquireContext';
import { IDotnetFindPathContext } from '../IDotnetFindPathContext';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
import { TelemetryUtilities } from './TelemetryUtilities';

export class EventCancellationError extends Error
{
    constructor(public readonly eventType: string, msg: string, stack?: string)
    {
        super(msg);
    }
}

export class EventBasedError extends Error
{
    constructor(public readonly eventType: string, msg: string, stack?: string)
    {
        super(msg);
    }
}

export abstract class GenericModalEvent extends IEvent
{
    abstract readonly mode: DotnetInstallMode;
    abstract readonly installType: DotnetInstallType;
}

export class DotnetAcquisitionStarted extends GenericModalEvent
{
    public readonly eventName = 'DotnetAcquisitionStarted';
    public readonly type = EventType.DotnetAcquisitionStart;
    public readonly mode: DotnetInstallMode;
    public readonly installType: DotnetInstallType;

    constructor(public readonly install: DotnetInstall, public readonly startingVersion: string, public readonly requestingExtensionId = '')
    {
        super();
        this.mode = install.installMode;
        this.installType = install.isGlobal ? 'global' : 'local';
    }

    public getProperties()
    {
        return {
            ...InstallToStrings(this.install),
            AcquisitionStartVersion: this.startingVersion,
            AcquisitionInstallId: this.install.installId,
            extensionId: this.requestingExtensionId
        };
    }
}

abstract class DotnetAcquisitionStartedBase extends IEvent
{
    constructor(public readonly requestingExtensionId = '')
    {
        super();
    }

    public getProperties()
    {
        return { extensionId: TelemetryUtilities.HashData(this.requestingExtensionId) };
    }
}

export class DotnetRuntimeAcquisitionStarted extends DotnetAcquisitionStartedBase
{
    public readonly eventName = 'DotnetRuntimeAcquisitionStarted';
    public readonly type = EventType.DotnetModalChildEvent;
}

export class DotnetSDKAcquisitionStarted extends DotnetAcquisitionStartedBase
{
    public readonly eventName = 'DotnetSDKAcquisitionStarted';
    public readonly type = EventType.DotnetModalChildEvent;
}

export class DotnetGlobalSDKAcquisitionStarted extends DotnetAcquisitionStartedBase
{
    public readonly eventName = 'DotnetGlobalSDKAcquisitionStarted';
    public readonly type = EventType.DotnetModalChildEvent;
}

export class DotnetASPNetRuntimeAcquisitionStarted extends DotnetAcquisitionStartedBase
{
    public readonly eventName = 'DotnetASPNetRuntimeAcquisitionStarted';
    public readonly type = EventType.DotnetModalChildEvent;
}

export class DotnetAcquisitionTotalSuccessEvent extends GenericModalEvent
{
    public readonly type = EventType.DotnetTotalSuccessEvent;
    public readonly eventName = 'DotnetAcquisitionTotalSuccessEvent';
    public readonly mode;
    public readonly installType: DotnetInstallType;

    constructor(public readonly startingVersion: string, public readonly install: DotnetInstall, public readonly requestingExtensionId = '', public readonly finalPath: string)
    {
        super();
        this.mode = install.installMode;
        this.installType = install.isGlobal ? 'global' : 'local';
    }

    public getProperties()
    {
        return {
            AcquisitionStartVersion: this.startingVersion,
            AcquisitionInstallId: this.install.installId,
            ...InstallToStrings(this.install),
            ExtensionId: TelemetryUtilities.HashData(this.requestingExtensionId),
            FinalPath: this.finalPath,
        };
    }
}

abstract class DotnetAcquisitionTotalSuccessEventBase extends IEvent
{
    public readonly type = EventType.DotnetModalChildEvent;

    constructor(public readonly installId: DotnetInstall)
    {
        super();
    }

    public getProperties()
    {
        return {
            ...InstallToStrings(this.installId),
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

    constructor(public readonly startingVersion: string, public readonly requestingId = '', mode: DotnetInstallMode, installType: DotnetInstallType)
    {
        super();
        this.mode = mode;
        this.installType = installType;
    }

    public getProperties()
    {
        return {
            AcquisitionStartVersion: this.startingVersion,
            RequestingExtensionId: TelemetryUtilities.HashData(this.requestingId)
        };
    }
}


abstract class DotnetAcquisitionRequestedEventBase extends IEvent
{
    public readonly type = EventType.DotnetModalChildEvent;

    constructor(public readonly startingVersion: string, public readonly requestingId = '', public readonly mode: DotnetInstallMode)
    {
        super();
    }

    public getProperties()
    {
        return {
            AcquisitionStartVersion: this.startingVersion,
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


export class DotnetAcquisitionCompleted extends IEvent
{
    public readonly eventName = 'DotnetAcquisitionCompleted';
    public readonly type = EventType.DotnetAcquisitionCompleted;

    constructor(public readonly install: DotnetInstall, public readonly dotnetPath: string, public readonly version: string)
    {
        super();
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        if (telemetry)
        {
            return {
                ...InstallToStrings(this.install),
                AcquisitionCompletedInstallId: this.install.installId,
                AcquisitionCompletedVersion: this.version
            };
        }
        else
        {
            return {
                ...InstallToStrings(this.install),
                AcquisitionCompletedVersion: this.version,
                AcquisitionCompletedInstallId: this.install.installId,
                AcquisitionCompletedDotnetPath: this.dotnetPath
            };
        }
    }
}

export abstract class DotnetAcquisitionError extends IEvent
{
    public type = EventType.DotnetAcquisitionError;
    public isError = true;

    /**
     *
     * @param error The error that triggered, so the call stack, etc. can be analyzed.
     * @param install For acquisition errors, you MUST include this install id. For commands unrelated to acquiring or managing a specific dotnet version, you
     * have the option to leave this parameter null. If it is NULL during acquisition the extension CANNOT properly manage what it has finished installing or not.
     */
    constructor(public readonly error: Error, public readonly install: DotnetInstall | null)
    {
        super();
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        return {
            ErrorName: this.error.name,
            ErrorMessage: this.error.message,
            StackTrace: this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '',
            InstallId: this.install?.installId ?? 'null',
            ...InstallToStrings(this.install!)
        };
    }
}

export class DotnetAcquisitionFinalError extends GenericModalEvent
{
    public readonly type = EventType.DotnetAcquisitionFinalError;
    public readonly eventName = 'DotnetAcquisitionFinalError';
    public readonly mode;
    public readonly installType: DotnetInstallType;

    constructor(public readonly error: Error, public readonly originalEventName: string, public readonly install: DotnetInstall)
    {
        super();
        this.mode = install.installMode;
        this.installType = install.isGlobal ? 'global' : 'local';
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        return {
            ErrorName: this.error.name,
            ErrorMessage: this.error.message,
            StackTrace: this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '',
            InstallId: this.install?.installId ?? 'null',
            ...InstallToStrings(this.install!)
        };
    }
}

/**
 * @remarks A wrapper around events to detect them as a failure to install.
 * This allows us to count all errors and analyze them into categories.
 * The event name for the failure cause is stored in the originalEventName property.
 */
abstract class DotnetAcquisitionFinalErrorBase extends DotnetAcquisitionError
{

    constructor(public readonly error: Error, public readonly originalEventName: string, public readonly install: DotnetInstall)
    {
        super(error, install);
        this.type = EventType.DotnetAcquisitionFinalError;
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        return {
            FailureMode: this.originalEventName,
            ErrorName: this.error.name,
            ErrorMessage: this.error.message,
            StackTrace: this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '',
            InstallId: this.install?.installId ?? 'null',
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

export abstract class DotnetNonAcquisitionError extends IEvent
{
    public readonly type = EventType.DotnetAcquisitionError;
    public isError = true;

    constructor(public readonly error: Error)
    {
        super();
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        return {
            ErrorName: this.error.name,
            ErrorMessage: this.error.message,
            StackTrace: this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : ''
        };
    }
}

export abstract class DotnetInstallExpectedAbort extends IEvent
{
    public readonly type = EventType.DotnetInstallExpectedAbort;
    public isError = true;

    /**
     *
     * @param error The error that triggered, so the call stack, etc. can be analyzed.
     * @param install For acquisition errors, you MUST include this install id. For commands unrelated to acquiring or managing a specific dotnet version, you
     * have the option to leave this parameter null. If it is NULL during acquisition the extension CANNOT properly manage what it has finished installing or not.
     */
    constructor(public readonly error: Error, public readonly install: DotnetInstall | null)
    {
        super();
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        if (this.install)
        {
            return {
                ErrorName: this.error?.name ?? 'GenericError',
                ErrorMessage: this.error?.message ?? 'ErrorMessage not provided',
                StackTrace: this.error?.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '',
                InstallId: this.install?.installId ?? 'null',
                ...InstallToStrings(this.install) ?? 'No Install Info'
            };
        }
        else
        {
            return {
                ErrorName: this.error.name,
                ErrorMessage: this.error.message,
                StackTrace: this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '',
                InstallId: 'null'
            };
        }
    }
}

export class SuppressedAcquisitionError extends IEvent
{
    public eventName = 'SuppressedAcquisitionError';
    public readonly type = EventType.SuppressedAcquisitionError;

    constructor(public readonly error: Error, public readonly supplementalMessage: string)
    {
        super();
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        return {
            SupplementMessage: this.supplementalMessage,
            ErrorName: this.error.name,
            ErrorMessage: telemetry ? 'redacted' : TelemetryUtilities.HashAllPaths(this.error.message),
            StackTrace: telemetry ? 'redacted' : (this.error.stack ? TelemetryUtilities.HashAllPaths(this.error.stack) : '')
        };
    }
}

export class DotnetInstallScriptAcquisitionError extends DotnetAcquisitionError
{
    public readonly eventName = 'DotnetInstallScriptAcquisitionError';
}

export class UserManualInstallFailure extends SuppressedAcquisitionError
{
    eventName = 'UserManualInstallFailure';
}

export class OfflineDetectionLogicTriggered extends SuppressedAcquisitionError
{
    eventName = 'OfflineDetectionLogicTriggered';
}

export class DotnetInstallationValidationMissed extends SuppressedAcquisitionError
{
    eventName = 'DotnetInstallationValidationMissed';
}

export class OSXOpenNotAvailableError extends DotnetAcquisitionError
{
    public readonly eventName = 'OSXOpenNotAvailableError';
}

export class WebRequestError extends DotnetAcquisitionError
{
    public readonly eventName = 'WebRequestError';
}

export class DiskIsFullError extends DotnetAcquisitionError
{
    public readonly eventName = 'DiskIsFullError';
}

export class DotnetDownloadFailure extends DotnetAcquisitionError
{
    public readonly eventName = 'DotnetDownloadFailure';
}

export class DotnetPreinstallDetectionError extends DotnetAcquisitionError
{
    public readonly eventName = 'DotnetPreinstallDetectionError';
}

export class TimeoutSudoProcessSpawnerError extends DotnetAcquisitionError
{
    public readonly eventName = 'TimeoutSudoProcessSpawnerError';
}

export class TimeoutSudoCommandExecutionError extends DotnetAcquisitionError
{
    public readonly eventName = 'TimeoutSudoCommandExecutionError';
}

export class CommandExecutionNonZeroExitFailure extends DotnetAcquisitionError
{
    public readonly eventName = 'CommandExecutionNonZeroExitFailure';
}

export class DotnetNotInstallRelatedCommandFailed extends DotnetNonAcquisitionError
{
    public readonly eventName = 'DotnetNotInstallRelatedCommandFailed';

    constructor(error: Error, public readonly command: string)
    {
        super(error);
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        return {
            ErrorMessage: this.error.message,
            CommandName: this.command,
            ErrorName: this.error.name,
            StackTrace: this.error.stack ? this.error.stack : ''
        };
    }
}

export class InvalidUninstallRequest extends DotnetNonAcquisitionError
{
    public readonly eventName = 'InvalidUninstallRequest';
}

export class DotnetCommandFailed extends DotnetAcquisitionError
{
    public readonly eventName = 'DotnetCommandFailed';

    constructor(error: Error, public readonly command: string, install: DotnetInstall | null)
    {
        super(error, install);
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        return {
            ErrorMessage: this.error.message,
            CommandName: this.command,
            ErrorName: this.error.name,
            StackTrace: this.error.stack ? this.error.stack : '',
            InstallId: this.install?.installId ?? 'null',
            ...InstallToStrings(this.install!)
        };
    }
}

export class DotnetInvalidReleasesJSONError extends DotnetAcquisitionError
{
    public readonly eventName = 'DotnetInvalidReleasesJSONError';
}

export class DotnetNoInstallerFileExistsError extends DotnetAcquisitionError
{
    public readonly eventName = 'DotnetNoInstallerFileExistsError';
}

export class DotnetNoInstallerResponseError extends DotnetInstallExpectedAbort
{
    public readonly eventName = 'DotnetNoInstallerResponseError';
}

export class DotnetUnexpectedInstallerOSError extends DotnetAcquisitionError
{
    public readonly eventName = 'DotnetUnexpectedInstallerOSError';
}

export class DotnetUnexpectedInstallerArchitectureError extends DotnetAcquisitionError
{
    public readonly eventName = 'DotnetUnexpectedInstallerArchitectureError';
}

export class DotnetFeatureBandDoesNotExistError extends DotnetAcquisitionError
{
    public readonly eventName = 'DotnetFeatureBandDoesNotExistError';
}

export class DotnetInvalidRuntimePatchVersion extends DotnetAcquisitionError
{
    public readonly eventName = 'DotnetInvalidRuntimePatchVersion';
}

export class DotnetWSLSecurityError extends DotnetInstallExpectedAbort
{
    public readonly eventName = 'DotnetWSLSecurityError';
}


export abstract class DotnetAcquisitionVersionError extends DotnetAcquisitionError
{
    constructor(error: Error, public readonly install: DotnetInstall | null)
    {
        super(error, install);
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        return this.install ? {
            ErrorMessage: this.error.message,
            AcquisitionErrorInstallId: this.install.installId ?? 'null',
            ...InstallToStrings(this.install),
            ErrorName: this.error.name,
            StackTrace: this.error.stack ?? ''
        }
            :
            {
                ErrorMessage: this.error.message,
                AcquisitionErrorInstallId: 'null',
                ErrorName: this.error.name,
                StackTrace: this.error.stack ?? ''
            };
    }
}

export class DotnetAcquisitionUnexpectedError extends DotnetAcquisitionVersionError
{
    public readonly eventName = 'DotnetAcquisitionUnexpectedError';
}

export class DotnetAcquisitionInstallError extends DotnetAcquisitionVersionError
{
    public readonly eventName = 'DotnetAcquisitionInstallError';
}

export class DotnetAcquisitionScriptError extends DotnetAcquisitionVersionError
{
    public readonly eventName = 'DotnetAcquisitionScriptError';
}

export class DotnetConflictingGlobalWindowsInstallError extends DotnetInstallExpectedAbort
{
    public readonly eventName = 'DotnetConflictingGlobalWindowsInstallError';
}

export class DotnetInstallCancelledByUserError extends DotnetInstallExpectedAbort
{
    public readonly eventName = 'DotnetInstallCancelledByUserError';
}

export class DotnetDebuggingMessage extends IEvent
{
    public readonly eventName = 'DotnetDebuggingMessage';
    public readonly type = EventType.DotnetDebuggingMessage;

    constructor(public readonly message: string)
    {
        super();
        this.message = message;
    }

    public getProperties()
    {
        return { message: this.message };
    }
}

export class DotnetNonZeroInstallerExitCodeError extends DotnetAcquisitionError
{
    public readonly eventName = 'DotnetNonZeroInstallerExitCodeError';
}

export class DotnetOfflineFailure extends DotnetAcquisitionVersionError
{
    public readonly eventName = 'DotnetOfflineFailure';
}

export class PowershellBadLanguageMode extends DotnetAcquisitionVersionError
{
    public readonly eventName = 'PowershellBadLanguageMode';
}

export class PowershellBadExecutionPolicy extends DotnetAcquisitionVersionError
{
    public readonly eventName = 'PowershellBadExecutionPolicy';
}
export class DotnetAcquisitionTimeoutError extends DotnetAcquisitionVersionError
{
    public readonly eventName = 'DotnetAcquisitionTimeoutError';

    constructor(error: Error, installId: DotnetInstall | null, public readonly timeoutValue: number)
    {
        super(error, installId);
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        if (this.install)
        {
            return {
                ErrorMessage: this.error.message,
                TimeoutValue: this.timeoutValue.toString(),
                ...InstallToStrings(this.install),
                ErrorName: this.error.name,
                StackTrace: this.error.stack ? this.error.stack : ''
            };
        }
        else
        {
            return {
                ErrorMessage: this.error.message,
                TimeoutValue: this.timeoutValue.toString(),
                ErrorName: this.error.name,
                StackTrace: this.error.stack ? this.error.stack : ''
            };
        }
    }

}

export class DotnetVersionResolutionError extends DotnetInstallExpectedAbort
{
    public readonly eventName = 'DotnetVersionResolutionError';
}

export class DotnetConflictingLinuxInstallTypesError extends DotnetInstallExpectedAbort
{
    public readonly eventName = 'DotnetConflictingLinuxInstallTypesError';
}

export class DotnetCustomLinuxInstallExistsError extends DotnetInstallExpectedAbort
{
    public readonly eventName = 'DotnetCustomLinuxInstallExistsError';
}

export class DotnetInstallationValidationError extends DotnetAcquisitionVersionError
{
    public readonly eventName = 'DotnetInstallationValidationError';
    public readonly fileStructure: string;
    constructor(error: Error, install: DotnetInstall, public readonly dotnetPath: string)
    {
        super(error, install);
        this.fileStructure = this.getFileStructure();
    }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        if (this.install)
        {
            return {
                ErrorMessage: this.error.message,
                AcquisitionErrorInstallId: this.install?.installId ?? 'null',
                InstallId: this.install?.installId ?? 'null',
                ...InstallToStrings(this.install),
                ErrorName: this.error.name,
                StackTrace: this.error.stack ? this.error.stack : '',
                FileStructure: this.fileStructure
            };
        }
        else
        {
            return {
                ErrorMessage: this.error.message,
                AcquisitionErrorInstallId: 'null',
                InstallId: 'null',
                ErrorName: this.error.name,
                StackTrace: this.error.stack ? this.error.stack : '',
                FileStructure: this.fileStructure
            };
        }
    }

    private getFileStructure(): string
    {
        const folderPath = path.dirname(this.dotnetPath);
        if (!fs.existsSync(folderPath))
        {
            return `Dotnet Path (${path.basename(folderPath)}) does not exist`;
        }
        // Get 2 levels worth of content of the folder
        let files = fs.readdirSync(folderPath).map(file => path.join(folderPath, file));
        for (const file of files)
        {
            if (fs.statSync(file).isDirectory())
            {
                files = files.concat(fs.readdirSync(file).map(fileName => path.join(file, fileName)));
            }
        }
        const relativeFiles: string[] = [];
        for (const file of files)
        {
            relativeFiles.push(path.relative(path.dirname(folderPath), file));
        }

        return relativeFiles.join('\n');
    }
}

export class DotnetAcquisitionDistroUnknownError extends DotnetInstallExpectedAbort
{
    public readonly eventName = 'DotnetAcquisitionDistroUnknownError';

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        return {
            ErrorMessage: this.error.message,
            ErrorName: this.error.name,
            StackTrace: this.error.stack ? this.error.stack : '',
            InstallId: this.install?.installId ?? 'null',
            ...InstallToStrings(this.install!)
        };
    }
}


export abstract class DotnetAcquisitionSuccessEvent extends IEvent
{
    public readonly type = EventType.DotnetAcquisitionSuccessEvent;

    public getProperties(): { [id: string]: string } | undefined
    {
        return undefined;
    }
}

export class DotnetCommandSucceeded extends DotnetAcquisitionSuccessEvent
{
    public readonly eventName = 'DotnetCommandSucceeded';

    constructor(public readonly commandName: string) { super(); }

    public getProperties()
    {
        return { CommandName: this.commandName };
    }
}

export class DotnetUninstallAllStarted extends DotnetAcquisitionSuccessEvent
{
    public readonly eventName = 'DotnetUninstallAllStarted';
}

export class DotnetUninstallAllCompleted extends DotnetAcquisitionSuccessEvent
{
    public readonly eventName = 'DotnetUninstallAllCompleted';
}

export class DotnetVersionResolutionCompleted extends DotnetAcquisitionSuccessEvent
{
    public readonly eventName = 'DotnetVersionResolutionCompleted';

    constructor(public readonly requestedVersion: string, public readonly resolvedVersion: string) { super(); }

    public getProperties()
    {
        return {
            RequestedVersion: this.requestedVersion,
            ResolvedVersion: this.resolvedVersion
        };
    }
}

export class DotnetInstallScriptAcquisitionCompleted extends DotnetAcquisitionSuccessEvent
{
    public readonly eventName = 'DotnetInstallScriptAcquisitionCompleted';
}

export class DotnetExistingPathResolutionCompleted extends DotnetAcquisitionSuccessEvent
{
    public readonly eventName = 'DotnetExistingPathResolutionCompleted';

    constructor(public readonly resolvedPath: string) { super(); }

    public getProperties(telemetry = false)
    {
        return telemetry ? undefined : { ConfiguredPath: this.resolvedPath };
    }
}

export abstract class DotnetAcquisitionMessage extends IEvent
{
    public type = EventType.DotnetAcquisitionMessage;

    public getProperties(): { [id: string]: string } | undefined
    {
        return {};
    }
}

export class DotnetAcquisitionDeletion extends DotnetAcquisitionMessage
{
    public readonly eventName = 'DotnetAcquisitionDeletion';
    constructor(public readonly folderPath: string) { super(); }

    public getProperties(telemetry = false)
    {
        return telemetry ? undefined : { DeletedFolderPath: this.folderPath };
    }
}

export class DotnetFallbackInstallScriptUsed extends DotnetAcquisitionMessage
{
    public readonly eventName = 'DotnetFallbackInstallScriptUsed';
}

export abstract class DotnetCustomMessageEvent extends DotnetAcquisitionMessage
{
    constructor(public readonly eventMessage: string) { super(); }

    public getProperties()
    {
        return { Message: this.eventMessage };
    }
}

export abstract class DotnetVisibleWarningEvent extends DotnetCustomMessageEvent
{
    public readonly type = EventType.DotnetVisibleWarning;
}

export class DotnetFileIntegrityFailureEvent extends DotnetVisibleWarningEvent
{
    public readonly eventName = 'DotnetFileIntegrityFailureEvent';
}

export class DotnetUnableToCheckPATHArchitecture extends DotnetVisibleWarningEvent
{
    public readonly eventName = 'DotnetUnableToCheckPATHArchitecture';
}

export class UtilizingExistingInstallPromise extends DotnetCustomMessageEvent
{
    public readonly eventName = 'UtilizingExistingInstallPromise';
}

export class FileIsBusy extends DotnetCustomMessageEvent
{
    public readonly eventName = 'FileIsBusy';

    public getProperties()
    {
        return { ...super.getProperties(), ...getDisabledTelemetryOnChance(1) };
    }
}

export class FileIsNotBusy extends DotnetCustomMessageEvent
{
    public readonly eventName = 'FileIsNotBusy';

    public getProperties()
    {
        return { ...super.getProperties(), ...getDisabledTelemetryOnChance(1) };
    }
}

export class DotnetVersionCategorizedEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetVersionCategorizedEvent';

    public getProperties()
    {
        return { suppressTelemetry: 'true', ...super.getProperties() };
    }
}

export class DuplicateInstallDetected extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DuplicateInstallDetected';
}

export abstract class WebRequestTimer extends DotnetCustomMessageEvent
{

    constructor(public readonly eventMessage: string, public readonly durationMs: string,
        public readonly finished: string, public readonly url: string, public readonly status: string
    ) { super(eventMessage); }

    public getProperties()
    {
        return {
            Message: this.eventMessage,
            DurationMs: this.durationMs,
            Finished: this.finished,
            Url: this.url.replace(/\//g, '.'), // urls get redacted as paths, they are not PII able since they are shared common urls. replaceAll may not exist with certain compilers, use regex
            // see: https://github.com/microsoft/vscode/blob/a26fe3e4666aae75fdbfaacf7be153a07bdd12e8/src/vs/platform/telemetry/common/telemetryUtils.ts#L295C20-L295C105
            Status: this.status
        };
    }
}

export class CommandExecutionTimer extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandExecutionTimer';

    constructor(public readonly eventMessage: string, public readonly durationMs: string, public readonly commandRoot: string, public readonly fullCommandString: string) { super(eventMessage); }

    public getProperties()
    {
        return {
            ...super.getProperties(), DurationMs: this.durationMs, CommandRoot: TelemetryUtilities.HashAllPaths(this.fullCommandString),
            HashedFullCommand: TelemetryUtilities.HashData(this.commandRoot)
        };
    }
}

export class WebRequestTime extends WebRequestTimer
{
    public readonly eventName = 'WebRequestTime';
}

export class WebRequestCachedTime extends WebRequestTimer
{
    public readonly eventName = 'WebRequestCachedTime';
}

export class WebRequestTimeUnknown extends WebRequestTimer
{
    public readonly eventName = 'WebRequestTimeUnknown';
}

export class EmptyDirectoryToWipe extends DotnetCustomMessageEvent
{
    public readonly eventName = 'EmptyDirectoryToWipe';
}

export class ProxyUsed extends DotnetCustomMessageEvent
{
    public readonly eventName = 'ProxyUsed';
}

export class FileToWipe extends DotnetCustomMessageEvent
{
    public readonly eventName = 'FileToWipe';

    public getProperties()
    {
        return { ...getDisabledTelemetryOnChance(1), ...super.getProperties() };
    }
}

export class TriedToExitMasterSudoProcess extends DotnetCustomMessageEvent
{
    public readonly eventName = 'TriedToExitMasterSudoProcess';
}

export class FeatureBandDoesNotExist extends DotnetCustomMessageEvent
{
    public readonly eventName = 'FeatureBandDoesNotExist';
}

export class FileDoesNotExist extends DotnetCustomMessageEvent
{
    public readonly eventName = 'FileDoesNotExist';
}

export class DotnetUninstallStarted extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetUninstallStarted';
    public type = EventType.DotnetUninstallMessage;
}

export class DotnetUninstallCompleted extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetUninstallStarted';
    public type = EventType.DotnetUninstallMessage;
}

export class DotnetUninstallFailed extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetUninstallStarted';
    public type = EventType.DotnetUninstallMessage;
}


export class DotnetUninstallSkipped extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetUninstallSkipped';
    public type = EventType.DotnetUninstallMessage;
}

export class NoExtensionIdProvided extends DotnetCustomMessageEvent
{
    public readonly eventName = 'NoExtensionIdProvided';

    public getProperties()
    {
        return { ...getDisabledTelemetryOnChance(1), ...super.getProperties() };
    }
}

export class ConvertingLegacyInstallRecord extends DotnetCustomMessageEvent
{
    public readonly eventName = 'ConvertingLegacyInstallRecord';
}
export class FoundTrackingVersions extends DotnetCustomMessageEvent
{
    public readonly eventName = 'FoundTrackingVersions';

    public getProperties()
    {
        return { suppressTelemetry: 'true', ...super.getProperties() };
    }
}

export class RemovingVersionFromExtensionState extends DotnetCustomMessageEvent
{
    public readonly eventName = 'RemovingVersionFromExtensionState';

    public getProperties()
    {
        return { suppressTelemetry: 'true', ...super.getProperties() };
    }
}

export class RemovingExtensionFromList extends DotnetCustomMessageEvent
{
    public readonly eventName = 'RemovingExtensionFromList';

    public getProperties()
    {
        return { suppressTelemetry: 'true', ...super.getProperties() };
    }
}

export class RemovingOwnerFromList extends DotnetCustomMessageEvent
{
    public readonly eventName = 'RemovingOwnerFromList';

    public getProperties()
    {
        return { suppressTelemetry: 'true', ...super.getProperties() };
    }
}

export class SkipAddingInstallEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'SkipAddingInstallEvent';
}

export class AddTrackingVersions extends DotnetCustomMessageEvent
{
    public readonly eventName = 'AddTrackingVersions';

    public getProperties()
    {
        return { suppressTelemetry: 'true', ...super.getProperties() };
    }
}

export class DotnetWSLCheckEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetWSLCheckEvent';

    public getProperties()
    {
        return { suppressTelemetry: 'true', ...super.getProperties() };
    }
}

export class DotnetWSLOperationOutputEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetWSLOperationOutputEvent';
}

export class DotnetFindPathCommandInvoked extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathCommandInvoked';
    constructor(public readonly eventMessage: string, public readonly request: IDotnetFindPathContext) { super(eventMessage); }

    public getProperties()
    {
        return { Message: this.eventMessage, Context: JSON.stringify(this.request) };
    };
}

export class WebCacheClearEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'WebCacheClearEvent';

    public getProperties()
    {
        return { ...getDisabledTelemetryOnChance(1), ...super.getProperties() };
    }
}

export class CacheClearEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CacheClearEvent';

    public getProperties()
    {
        return { ...getDisabledTelemetryOnChance(1), ...super.getProperties() };
    }
}

export class CachePutEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CachePutEvent';
    constructor(public readonly eventMessage: string, public readonly indexStr: string, public readonly value: string, public readonly ttl: string) { super(eventMessage); }

    public getProperties()
    {
        return { Message: this.eventMessage, indexStr: this.indexStr, value: this.value, ttl: this.ttl, ...getDisabledTelemetryOnChance(1) };
    };
}

export class CacheGetEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CacheGetEvent';
    constructor(public readonly eventMessage: string, public readonly indexStr: string, public readonly value: string) { super(eventMessage); }

    public getProperties()
    {
        return { Message: this.eventMessage, indexStr: this.indexStr, value: this.value, ...getDisabledTelemetryOnChance(1) };
    };
}

export class DotnetFindPathLookupSetting extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathLookupSetting';
}

export class DotnetFindPathSettingFound extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathSettingFound';
}

export class DotnetFindPathLookupPATH extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathLookupPATH';
}

export class DotnetFindPathPATHFound extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathPATHFound';
}

export class DotnetFindPathLookupRealPATH extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathLookupRealPATH';
}

export class DotnetFindPathRealPATHFound extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathRealPATHFound';
}

export class DotnetConditionsValidated extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetConditionsValidated';

    public getProperties()
    {
        return { ...getDisabledTelemetryOnChance(1), ...super.getProperties() };
    }
}

export class DotnetFindPathHostFxrResolutionLookup extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathHostFxrResolutionLookup';
}

export class DotnetFindPathOnRegistry extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathOnRegistry';
}

export class DotnetFindPathNoHostOnRegistry extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathNoHostOnRegistry';
}

export class SudoDirCreationFailed extends DotnetCustomMessageEvent
{
    public readonly eventName = 'SudoDirCreationFailed';
}

export class SudoDirDeletionFailed extends DotnetCustomMessageEvent
{
    public readonly eventName = 'SudoDirDeletionFailed';
}

export class DotnetFindPathOnFileSystem extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathOnFileSystem';
}

export class DotnetFindPathNoHostOnFileSystem extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathNoHostOnFileSystem';
}

export class DotnetFindPathNoRuntimesOnHost extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathNoRuntimesOnHost';
}

export class DotnetFindPathLookupRootPATH extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathLookupRealPATH';
}

export class DotnetFindPathRootEmulationPATHFound extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathRealPATHFound';
}

export class DotnetFindPathRootUnderEmulationButNoneSet extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathRealPATHFound';
}

export class DotnetFindPathRootPATHFound extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathRealPATHFound';
}

export class DotnetFindPathMetCondition extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathMetCondition';
}

export class DotnetFindPathNoPathMetCondition extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathNoPathMetCondition';
}

export class DotnetFindPathDidNotMeetCondition extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFindPathDidNotMeetCondition';
}

export class DotnetTelemetrySettingEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetTelemetrySettingEvent';
}


export class DistroSupport extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DistroSupport';
}

export class FeedInjection extends DotnetCustomMessageEvent
{
    public readonly eventName = 'FeedInjection';
}

export class FeedInjectionStarted extends DotnetCustomMessageEvent
{
    type = EventType.FeedInjectionMessage
    public readonly eventName = 'FeedInjectionStarted';
}

export class FeedInjectionFinished extends DotnetCustomMessageEvent
{
    type = EventType.FeedInjectionMessage
    public readonly eventName = 'FeedInjectionFinished';
}

export class DistroPackagesSearch extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DistroPackagesSearch';
}

export class FoundDistroVersionDetails extends DotnetCustomMessageEvent
{
    public readonly eventName = 'FoundDistroVersionDetails';
}

export class DotnetVSCodeExtensionFound extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetVSCodeExtensionFound';

    public getProperties()
    {
        return { suppressTelemetry: 'true', ...super.getProperties() };
    }
}

export class DotnetVSCodeExtensionHasInstallRequest extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetVSCodeExtensionHasInstallRequest';
}

export class DotnetVSCodeExtensionChange extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetVSCodeExtensionChange';

    public getProperties()
    {
        return { suppressTelemetry: 'true', ...super.getProperties() };
    }
}

export class DotnetCommandNotFoundEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetCommandNotFoundEvent';
}

export class DotnetFileIntegrityCheckEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFileIntegrityCheckEvent';
}

export class GlobalAcquisitionContextMenuOpened extends DotnetCustomMessageEvent
{
    public readonly eventName = 'GlobalAcquisitionContextMenuOpened';
}

export class UserManualInstallVersionChosen extends DotnetCustomMessageEvent
{
    public readonly eventName = 'UserManualInstallVersionChosen';
}

export class UserManualInstallRequested extends DotnetCustomMessageEvent
{
    public readonly eventName = 'UserManualInstallRequested';
}

export class UserManualInstallSuccess extends DotnetCustomMessageEvent
{
    public readonly eventName = 'UserManualInstallSuccess';
}

export class CommandExecutionStdOut extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandExecutionStdOut';
}

export class NoMatchingInstallToStopTracking extends DotnetCustomMessageEvent
{
    public readonly eventName = 'NoMatchingInstallToStopTracking';
}

export class CommandExecutionStdError extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandExecutionStdError';
}

export class DotnetGlobalAcquisitionBeginEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetGlobalAcquisitionBeginEvent';
}

export class DotnetGlobalVersionResolutionCompletionEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetGlobalVersionResolutionCompletionEvent';
}

export class CommandProcessesExecutionFailureNonTerminal extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandProcessesExecutionFailureNonTerminal';
}

export class CommandProcessorExecutionBegin extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandProcessorExecutionBegin';
}

export class CommandProcessorExecutionEnd extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandProcessorExecutionEnd';
}

export class DotnetBeginGlobalInstallerExecution extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetBeginGlobalInstallerExecution';
}

export class DotnetCompletedGlobalInstallerExecution extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetCompletedGlobalInstallerExecution';
}

export class DotnetGlobalAcquisitionCompletionEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetGlobalAcquisitionCompletionEvent';
}

export class DotnetAlternativeCommandFoundEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetAlternativeCommandFoundEvent';
}

export class DotnetCommandFallbackArchitectureEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetCommandFallbackArchitectureEvent';
}

export class DotnetCommandFallbackOSEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetCommandFallbackOSEvent';
}

export class DotnetInstallIdCreatedEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetInstallIdCreatedEvent';

    public getProperties()
    {
        return { suppressTelemetry: 'true', ...super.getProperties() };
    }
}

export class DotnetLegacyInstallDetectedEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetLegacyInstallDetectedEvent';
}

export class DotnetLegacyInstallRemovalRequestEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetLegacyInstallRemovalRequestEvent';
}

export class DotnetFakeSDKEnvironmentVariableTriggered extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetFakeSDKEnvironmentVariableTriggered';
}

export class CommandExecutionNoStatusCodeWarning extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandExecutionNoStatusCodeWarning';
}

export class CommandExecutionSignalSentEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandExecutionSignalSentEvent';
}

export class CommandExecutionStatusEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandExecutionStatusEvent';
}

export class CommandExecutionEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandExecutionEvent';
}

export class SudoProcAliveCheckBegin extends DotnetCustomMessageEvent
{
    public readonly eventName = 'SudoProcAliveCheckBegin';
}

export class SudoProcAliveCheckEnd extends DotnetCustomMessageEvent
{
    public readonly eventName = 'SudoProcAliveCheckEnd';
}

export class SudoProcCommandExchangeBegin extends DotnetCustomMessageEvent
{
    public readonly eventName = 'SudoProcCommandExchangeBegin';
}

export class SudoProcCommandExchangePing extends DotnetCustomMessageEvent
{
    public readonly eventName = 'SudoProcCommandExchangePing';
}

export class WaitingForDotnetInstallerResponse extends DotnetCustomMessageEvent
{
    public readonly eventName = 'WaitingForDotnetInstallerResponse';
}

export class SudoProcCommandExchangeEnd extends DotnetCustomMessageEvent
{
    public readonly eventName = 'SudoProcCommandExchangeEnd';
}

export class CommandExecutionUserAskDialogueEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandExecutionUserAskDialogueEvent';
}

export class CommandExecutionUserCompletedDialogueEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandExecutionUserCompletedDialogueEvent';
}

export class CommandExecutionUnderSudoEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'CommandExecutionUnderSudoEvent';
    public getProperties()
    {
        return { ...getDisabledTelemetryOnChance(1), ...super.getProperties() };
    }
}

export class CommandExecutionUserRejectedPasswordRequest extends DotnetInstallExpectedAbort
{
    public readonly eventName = 'CommandExecutionUserRejectedPasswordRequest';
}

export class CommandExecutionUnknownCommandExecutionAttempt extends DotnetInstallExpectedAbort
{
    public readonly eventName = 'CommandExecutionUnknownCommandExecutionAttempt';
}

export class DotnetVersionParseEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetVersionParseEvent';
}

export class DotnetUpgradedEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetUpgradedEvent';
    constructor(eventMsg: string)
    {
        super(eventMsg);
        this.type = EventType.DotnetUpgradedEvent;
    }
}

export class DotnetOfflineInstallUsed extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetOfflineInstallUsed';
    constructor(eventMsg: string)
    {
        super(eventMsg);
        this.type = EventType.OfflineInstallUsed;
    }
}

export class DotnetOfflineWarning extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetOfflineWarning';
    constructor(eventMsg: string)
    {
        super(eventMsg);
        this.type = EventType.OfflineWarning;
    }
}

export class NetInstallerBeginExecutionEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'NetInstallerBeginExecutionEvent';
}

export class NetInstallerEndExecutionEvent extends DotnetCustomMessageEvent
{
    public readonly eventName = 'NetInstallerEndExecutionEvent';
}

export class FailedToRunSudoCommand extends DotnetCustomMessageEvent
{
    public readonly eventName = 'FailedToRunSudoCommand';
}

export class DotnetInstallLinuxChecks extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetInstallLinuxChecks';
}

export abstract class DotnetFileEvent extends DotnetAcquisitionMessage
{
    constructor(public readonly eventMessage: string, public readonly time: string, public readonly file: string) { super(); }

    public getProperties()
    {
        return { Message: this.eventMessage, Time: this.time, File: TelemetryUtilities.HashData(this.file) };
    }
}

export abstract class DotnetLockEvent extends DotnetFileEvent
{
    constructor(public readonly eventMessage: string, public readonly time: string, public readonly lock: string, public readonly file: string) { super(eventMessage, time, file); }

    public getProperties()
    {
        return { Message: this.eventMessage, Time: this.time, Lock: this.lock, File: this.file, ...getDisabledTelemetryOnChance(1) };
    }
}

export class GenericDotnetLockEvent extends DotnetLockEvent
{
    public readonly eventName = 'GenericDotnetLockEvent';
}

export class DotnetFileWriteRequestEvent extends DotnetFileEvent
{
    public readonly eventName = 'DotnetFileWriteRequestEvent';

    public getProperties()
    {
        return { suppressTelemetry: 'true', ...super.getProperties() };
    }
}

export class DotnetAcquisitionPartialInstallation extends DotnetAcquisitionMessage
{
    public readonly eventName = 'DotnetAcquisitionPartialInstallation';
    constructor(public readonly install: DotnetInstall) { super(); }

    public getProperties()
    {
        return {
            ...InstallToStrings(this.install!),
            PartialInstallationInstallId: this.install.installId
        };
    }
}

export class DotnetAcquisitionInProgress extends IEvent
{
    public readonly type = EventType.DotnetAcquisitionInProgress;

    public readonly eventName = 'DotnetAcquisitionInProgress';
    constructor(public readonly install: DotnetInstall, public readonly requestingExtensionId: string | null) { super(); }

    public getProperties()
    {
        return {
            InProgressInstallationInstallId: this.install.installId,
            ...InstallToStrings(this.install!),
            extensionId: TelemetryUtilities.HashData(this.requestingExtensionId)
        };
    }
}

export class DotnetAcquisitionAlreadyInstalled extends IEvent
{
    public readonly eventName = 'DotnetAcquisitionAlreadyInstalled';
    public readonly type = EventType.DotnetAcquisitionAlreadyInstalled;

    constructor(public readonly install: DotnetInstall, public readonly requestingExtensionId: string | null) { super(); }

    public getProperties()
    {
        return {
            ...InstallToStrings(this.install),
            extensionId: TelemetryUtilities.HashData(this.requestingExtensionId)
        };
    }
}

export class DotnetAcquisitionMissingLinuxDependencies extends DotnetAcquisitionMessage
{
    public readonly eventName = 'DotnetAcquisitionMissingLinuxDependencies';
}

export class DotnetAcquisitionThoughtInstalledButNot extends DotnetCustomMessageEvent
{
    public readonly eventName = 'DotnetAcquisitionThoughtInstalledButNot';
}

export class DotnetAcquisitionScriptOutput extends DotnetAcquisitionMessage
{
    public readonly eventName = 'DotnetAcquisitionScriptOutput';
    public isError = true;
    constructor(public readonly install: DotnetInstall, public readonly output: string) { super(); }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        return {
            AcquisitionInstallId: this.install.installId,
            ...InstallToStrings(this.install!),
            ScriptOutput: this.output
        };
    }
}

export class DotnetInstallationValidated extends DotnetAcquisitionMessage
{
    public readonly eventName = 'DotnetInstallationValidated';
    constructor(public readonly install: DotnetInstall) { super(); }

    public getProperties(telemetry = false): { [id: string]: string } | undefined
    {
        return {
            ValidatedInstallId: this.install.installId,
            ...InstallToStrings(this.install!)
        };
    }
}

export class DotnetAcquisitionStatusRequested extends DotnetAcquisitionMessage
{
    public readonly eventName = 'DotnetAcquisitionStatusRequested';

    constructor(public readonly version: string,
        public readonly requestingId = '')
    {
        super();
    }

    public getProperties()
    {
        return {
            AcquisitionStartVersion: this.version,
            RequestingExtensionId: TelemetryUtilities.HashData(this.requestingId)
        };
    }
}

export class DotnetAcquisitionStatusUndefined extends DotnetAcquisitionMessage
{
    public readonly eventName = 'DotnetAcquisitionStatusUndefined';

    constructor(public readonly installId: DotnetInstall)
    {
        super();
    }

    public getProperties()
    {
        return {
            AcquisitionStatusInstallId: this.installId.installId,
            ...InstallToStrings(this.installId!)
        };
    }
}

export class DotnetAcquisitionStatusResolved extends DotnetAcquisitionMessage
{
    public readonly eventName = 'DotnetAcquisitionStatusResolved';

    constructor(public readonly installId: DotnetInstall, public readonly version: string)
    {
        super();
    }

    public getProperties()
    {
        return {
            AcquisitionStatusInstallId: this.installId.installId,
            ...InstallToStrings(this.installId!),
            AcquisitionStatusVersion: this.version
        };
    }
}

export class WebRequestSent extends DotnetAcquisitionMessage
{
    public readonly eventName = 'WebRequestSent';

    constructor(public readonly url: string)
    {
        super();
    }

    public getProperties()
    {
        return { WebRequestUri: this.url };
    }
}

export class WebRequestUsingAltClient extends DotnetAcquisitionMessage
{
    public readonly eventName = 'WebRequestUsingAltClient';

    constructor(public readonly url: string, public readonly msg: string)
    {
        super();
    }

    public getProperties()
    {
        return { WebRequestUri: this.url, Message: this.msg };
    }
}


export class WebRequestInitiated extends DotnetAcquisitionMessage
{
    public readonly eventName = 'WebRequestInitiated';

    constructor(public readonly url: string)
    {
        super();
    }

    public getProperties()
    {
        return { WebRequestUri: this.url };
    }
}

export class DotnetPreinstallDetected extends DotnetAcquisitionMessage
{
    public readonly eventName = 'DotnetPreinstallDetected';
    constructor(public readonly installId: DotnetInstall) { super(); }

    public getProperties()
    {
        return {
            ...InstallToStrings(this.installId!),
            PreinstalledInstallId: this.installId.installId
        };
    }
}

export class TestAcquireCalled extends IEvent
{
    public readonly eventName = 'TestAcquireCalled';
    public readonly type = EventType.DotnetAcquisitionTest;

    constructor(public readonly context: IDotnetInstallationContext)
    {
        super();
    }

    public getProperties()
    {
        return undefined;
    }
}

function getDisabledTelemetryOnChance(percentIntToSend: number): { [disableTelemetryId: string]: string }
{
    return { suppressTelemetry: (!(Math.random() < percentIntToSend / 100)).toString() };
}