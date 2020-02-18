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

    constructor(public readonly error: Error) {
        super();
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorName : this.error.name,
                ErrorMessage : this.error.message,
                StackTrace : this.error.stack ? this.error.stack : ''};
    }
}

export class DotnetVersionResolutionError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetVersionResolutionError';

    constructor(error: Error, private readonly version: string) { super(error); }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ErrorMessage : this.error.message,
                RequestedVersion : this.version,
                ErrorName : this.error.name,
                StackTrace : this.error.stack ? this.error.stack : ''};
    }
}

export class DotnetInstallScriptAcquisitionError extends DotnetAcquisitionError {
    public readonly eventName = 'DotnetInstallScriptAcquisitionError';
}

export class WebRequestError extends DotnetAcquisitionError {
    public readonly eventName = 'WebRequestError';
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
        if (!fs.existsSync(this.dotnetPath)) {
            return `Dotnet Path (${ this.dotnetPath }) does not exist`;
        }
        // Get 2 levels worth of content of the folder
        let files = fs.readdirSync(this.dotnetPath).map(file => path.join(this.dotnetPath, file));
        for (const file of files) {
            if (fs.statSync(file).isDirectory()) {
                files = files.concat(fs.readdirSync(file).map(fileName => path.join(file, fileName)));
            }
        }
        const relativeFiles: string[] = [];
        for (const file of files) {
            relativeFiles.push(path.relative(this.dotnetPath, file));
        }

        return relativeFiles.join('\n');
    }
}

export abstract class DotnetAcquisitionSuccessEvent extends IEvent {
    public readonly type = EventType.DotnetAcquisitionSuccessEvent;

    public getProperties(): { [key: string]: string } | undefined {
        return undefined;
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
    constructor(public readonly version: string, public readonly output: string) { super(); }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        if (telemetry) {
            return {AcquisitionVersion : this.version};
        } else {
            return {AcquisitionVersion : this.version,
                ScriptOutput: this.output};
        }
    }
}

export class DotnetInstallationValidated extends DotnetAcquisitionMessage {
    public readonly eventName = 'DotnetInstallationValidated';
    constructor(public readonly version: string) { super(); }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return {ValidatedVersion : this.version};
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
