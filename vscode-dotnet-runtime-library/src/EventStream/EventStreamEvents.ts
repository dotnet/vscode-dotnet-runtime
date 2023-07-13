/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import { IDotnetInstallationContext } from '../Acquisition/IDotnetInstallationContext';
import { EventType } from './EventType';
import { IEvent } from './IEvent';

// tslint:disable max-classes-per-file

export class DotnetAcquisitionStarted extends IEvent {
    public readonly eventName = 'DotnetAcquisitionStarted';
    public readonly type = EventType.DotnetAcquisitionStart;

    constructor(public readonly version: string) {
        super();
    }

    public getProperties() {
        return {AcquisitionStartVersion : this.version};
    }
}

export class DotnetRuntimeAcquisitionStarted extends IEvent {
    public readonly eventName = 'DotnetRuntimeAcquisitionStarted';
    public readonly type = EventType.DotnetRuntimeAcquisitionStart;

    public getProperties() {
        return undefined;
    }
}

export class DotnetSDKAcquisitionStarted extends IEvent {
    public readonly eventName = 'DotnetSDKAcquisitionStarted';
    public readonly type = EventType.DotnetSDKAcquisitionStart;

    public getProperties() {
        return undefined;
    }
}

export class DotnetAcquisitionCompleted extends IEvent {
    public readonly eventName = 'DotnetAcquisitionCompleted';
    public readonly type = EventType.DotnetAcquisitionCompleted;

    constructor(public readonly version: string, public readonly dotnetPath: string) {
        super();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        if (telemetry) {
            return {AcquisitionCompletedVersion : this.version};
        } else {
            return {AcquisitionCompletedVersion : this.version,
                    AcquisitionCompletedDotnetPath : this.dotnetPath};
        }

    }
}

export abstract class DotnetAcquisitionError extends IEvent {
    public readonly type = EventType.DotnetAcquisitionError;
    public isError = true;

    constructor(public readonly error: Error) {
        super();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorName : this.error.name,
                ErrorMessage : this.error.message,
                StackTrace : this.error.stack ? this.error.stack : ''};
    }
}

export class DotnetInstallScriptAcquisitionError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetInstallScriptAcquisitionError';
}

export class WebRequestError extends DotnetAcquisitionError {
    public readonly eventName = 'WebRequestError';
}

export class DotnetPreinstallDetectionError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetPreinstallDetectionError';
}

export class DotnetCommandFailed extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetCommandFailed';

    constructor(error: Error, public readonly command: string) {
        super(error);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            CommandName : this.command,
            ErrorName : this.error.name,
            StackTrace : this.error.stack ? this.error.stack : ''};
        }
    }

export class DotnetWSLSecurityError extends DotnetAcquisitionError {
        public readonly eventName = 'DotnetWSLSecurityError';
}

export abstract class DotnetAcquisitionVersionError extends DotnetAcquisitionError {
    constructor(error: Error, public readonly version: string) {
        super(error);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            AcquisitionErrorVersion : this.version,
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

export class DotnetConflictingGlobalWindowsInstallError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetConflictingGlobalWindowsInstallError';
}

export class DotnetNonZeroInstallerExitCodeError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetNonZeroInstallerExitCodeError';
}

export class DotnetOfflineFailure extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetOfflineFailure';
}

export class DotnetAcquisitionTimeoutError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetAcquisitionTimeoutError';

    constructor(error: Error, version: string, public readonly timeoutValue: number) {
        super(error, version);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            TimeoutValue : this.timeoutValue.toString(),
            Version : this.version,
            ErrorName : this.error.name,
            StackTrace : this.error.stack ? this.error.stack : ''};
    }
}

export class DotnetVersionResolutionError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetVersionResolutionError';
}

export class DotnetConflictingLinuxInstallTypesError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetConflictingLinuxInstallTypesError';
}

export class DotnetCustomLinuxInstallExistsError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetCustomLinuxInstallExistsError';
}


export class DotnetUnknownDistroError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetUnknownDistroError';
}

export class DotnetInstallationValidationError extends DotnetAcquisitionVersionError {
    public readonly eventName = 'DotnetInstallationValidationError';
    public readonly fileStructure: string;
    constructor(error: Error, version: string, public readonly dotnetPath: string) {
        super(error, version);
        this.fileStructure = this.getFileStructure();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            AcquisitionErrorVersion : this.version,
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

export class DotnetAcquisitionDistroUnknownError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetAcquisitionDistroUnknownError';

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
            ErrorName : this.error.name,
            StackTrace : this.error.stack ? this.error.stack : ''};
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

    constructor(public readonly requestedVerion: string, public readonly resolvedVersion: string) { super(); }

    public getProperties() {
        return {RequestedVersion : this.requestedVerion,
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
    public readonly type = EventType.DotnetAcquisitionMessage;

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

export class DotnetAcquisitionPartialInstallation extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionPartialInstallation';
    constructor(public readonly version: string) { super(); }

    public getProperties() {
        return {PartialInstallationVersion: this.version};
    }
}

export class DotnetAcquisitionInProgress extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionInProgress';
    constructor(public readonly version: string) { super(); }

    public getProperties() {
        return {InProgressInstallationVersion : this.version};
    }
}

export class DotnetAcquisitionAlreadyInstalled extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionAlreadyInstalled';
    constructor(public readonly version: string) { super(); }

    public getProperties() {
        return {AlreadyInstalledVersion : this.version};
    }
}

export class DotnetAcquisitionMissingLinuxDependencies extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionMissingLinuxDependencies';
}

export class DotnetAcquisitionScriptOuput extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionScriptOuput';
    public isError = true;
    constructor(public readonly version: string, public readonly output: string) { super(); }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {AcquisitionVersion : this.version,
                ScriptOutput: this.output};
    }
}

export class DotnetInstallationValidated extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetInstallationValidated';
    constructor(public readonly version: string) { super(); }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ValidatedVersion : this.version};
    }
}

export class DotnetAcquisitionRequested extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionRequested';

    constructor(public readonly version: string,
                public readonly requestingId = '') {
        super();
    }

    public getProperties() {
        return {AcquisitionStartVersion : this.version,
                RequestingExtensionId: this.requestingId};
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
                RequestingExtensionId: this.requestingId};
    }
}

export class DotnetAcquisitionStatusUndefined extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionStatusUndefined';

    constructor(public readonly version: string) {
        super();
    }

    public getProperties() {
        return {AcquisitionStatusVersion : this.version};
    }
}

export class DotnetAcquisitionStatusResolved extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetAcquisitionStatusResolved';

    constructor(public readonly version: string) {
        super();
    }

    public getProperties() {
        return {AcquisitionStatusVersion : this.version};
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
    constructor(public readonly version: string) { super(); }

    public getProperties() {
        return {PreinstalledVersion : this.version};
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
