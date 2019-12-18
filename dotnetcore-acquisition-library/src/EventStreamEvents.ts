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

    constructor(public readonly version: string) {
    }
}

export class DotnetAcquisitionCompleted implements IEvent {
    public readonly type = EventType.DotnetAcquisitionCompleted;

    constructor(public readonly version: string, public readonly dotnetPath: string) {
    }
}

export abstract class DotnetError implements IEvent {
    public readonly type = EventType.DotnetError;

    constructor(public readonly error: string) {}
}

export class DotnetVersionResolutionError extends DotnetError {}

export class DotnetInstallScriptAcquisitionError extends DotnetError {}

export class WebRequestError extends DotnetError {}

export abstract class DotnetAcquisitionError extends DotnetError {
    constructor(error: string, public readonly version: string) {
        super(error);
    }
}

export class DotnetAcquisitionUnexpectedError extends DotnetAcquisitionError {
    constructor(error: any, version: string) {
        if (error) {
            super(error.toString(), version);
        } else {
            super('', version);
        }
    }
}

export class DotnetAcquisitionInstallError extends DotnetAcquisitionError {
    constructor(error: ExecException, version: string) {
        const errorMsg = `Exit code: ${error.code}\nMessage: ${error.message}`;
        super(errorMsg, version);
    }
}

export class DotnetAcquisitionScriptError extends DotnetAcquisitionError {}

export abstract class DotnetSuccessEvent implements IEvent {
    public readonly type = EventType.DotnetSuccessEvent;
}

export class DotnetUninstallAllStarted extends DotnetSuccessEvent {}

export class DotnetUninstallAllCompleted extends DotnetSuccessEvent {}

export class DotnetVersionResolutionCompleted extends DotnetSuccessEvent {}

export class DotnetInstallScriptAcquisitionCompleted extends DotnetSuccessEvent {}

export class TestAcquireCalled implements IEvent {
    public readonly type = EventType.DotnetAcquisitionTest;

    constructor(public readonly context: IDotnetInstallationContext) {}
}
