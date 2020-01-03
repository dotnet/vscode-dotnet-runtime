/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ExecException } from 'child_process';
import { EventType } from './EventType';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { IEvent } from './IEvent';

// tslint:disable max-classes-per-file

export class DotnetAcquisitionStarted implements IEvent {
    public readonly type = EventType.DotnetAcquisitionStart;

    constructor(public readonly version: string) {}

    public getProperties() {
        return {AcquisitionStartVersion : this.version};
    }
}

export class DotnetAcquisitionCompleted implements IEvent {
    public readonly type = EventType.DotnetAcquisitionCompleted;

    constructor(public readonly version: string, public readonly dotnetPath: string) { }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        if (telemetry) {
            return {AcquisitionCompletedVersion : this.version};
        } else {
            return {AcquisitionCompletedVersion : this.version,
                AcquisitionCompletedDotnetPath : this.dotnetPath};
        }

    }
}

export abstract class DotnetAcquisitionError implements IEvent {
    public readonly type = EventType.DotnetAcquisitionError;

    constructor(public readonly error: string) {}

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        return telemetry ? undefined : {ErrorMessage : this.error};
    }
}

export class DotnetVersionResolutionError extends DotnetAcquisitionError {
    constructor(error: string, private readonly version: string) { super(error); }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        if (telemetry) {
            return {RequestedVersion : this.version};
        } else {
            return {ErrorMessage : this.error,
                RequestedVersion : this.version};
        }
    }
}

export class DotnetInstallScriptAcquisitionError extends DotnetAcquisitionError {}

export class WebRequestError extends DotnetAcquisitionError {}

export abstract class DotnetAcquisitionVersionError extends DotnetAcquisitionError {
    constructor(error: string, public readonly version: string) {
        super(error);
    }

    public getProperties(telemetry = false): { [key: string]: string } | undefined {
        if (telemetry) {
            return {AcquisitionErrorVersion : this.version};
        } else {
            return {ErrorMessage : this.error,
                AcquisitionErrorVersion : this.version};
        }
    }
}

export class DotnetAcquisitionUnexpectedError extends DotnetAcquisitionVersionError {
    constructor(error: any, version: string) {
        if (error) {
            super(error.toString(), version);
        } else {
            super('', version);
        }
    }
}

export class DotnetAcquisitionInstallError extends DotnetAcquisitionVersionError {
    constructor(error: ExecException, version: string) {
        const errorMsg = `Exit code: ${error.code}\nMessage: ${error.message}`;
        super(errorMsg, version);
    }
}

export class DotnetAcquisitionScriptError extends DotnetAcquisitionVersionError {}

export abstract class DotnetAcquisitionSuccessEvent implements IEvent {
    public readonly type = EventType.DotnetAcquisitionSuccessEvent;

    public getProperties(): { [key: string]: string } | undefined {
        return undefined;
    }
}

export class DotnetUninstallAllStarted extends DotnetAcquisitionSuccessEvent {}

export class DotnetUninstallAllCompleted extends DotnetAcquisitionSuccessEvent {}

export class DotnetVersionResolutionCompleted extends DotnetAcquisitionSuccessEvent {
    constructor(public readonly requestedVerion: string, public readonly resolvedVersion: string) { super(); }

    public getProperties() {
        return {RequestedVersion : this.requestedVerion,
                ResolvedVersion : this.resolvedVersion};
    }
}

export class DotnetInstallScriptAcquisitionCompleted extends DotnetAcquisitionSuccessEvent {}

export abstract class DotnetAcquisitionMessage implements IEvent {
    public readonly type = EventType.DotnetAcquisitionMessage;

    public getProperties(): { [key: string]: string } | undefined {
        return undefined;
    }
}

export class DotnetAcquisitionDeletion extends DotnetAcquisitionMessage {
    constructor(public readonly folderPath: string) { super(); }

    public getProperties(telemetry = false) {
        return telemetry ? undefined : {DeletedFolderPath : this.folderPath};
    }
}

export class DotnetAcquisitionPartialInstallation extends DotnetAcquisitionMessage {
    constructor(public readonly version: string) { super(); }

    public getProperties() {
        return {PartialInstallationVersion: this.version};
    }
}

export class DotnetAcquisitionInProgress extends DotnetAcquisitionMessage {
    constructor(public readonly version: string) { super(); }

    public getProperties() {
        return {InProgressInstallationVersion : this.version};
    }
}

export class DotnetAcquisitionAlreadyInstalled extends DotnetAcquisitionMessage {
    constructor(public readonly version: string) { super(); }

    public getProperties() {
        return {AlreadyInstalledVersion : this.version};
    }
}

export class DotnetAcquisitionMissingLinuxDependencies extends DotnetAcquisitionMessage {}

export class DotnetAcquisitionScriptOuput extends DotnetAcquisitionMessage {
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

export class TestAcquireCalled implements IEvent {
    public readonly type = EventType.DotnetAcquisitionTest;

    constructor(public readonly context: IDotnetInstallationContext) {}

    public getProperties() {
        return undefined;
    }
}
