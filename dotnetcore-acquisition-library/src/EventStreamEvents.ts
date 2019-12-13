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

export abstract class DotnetAcquisitionError implements IEvent {
    public readonly type = EventType.DotnetAcquisitionError;

    constructor(public readonly version: string) {
    }

    public abstract getErrorMessage(): string;
}

export class DotnetAcquisitionUnexpectedError extends DotnetAcquisitionError {
    constructor(private readonly error: any, version: string) {
        super(version);
    }

    public getErrorMessage(): string {
        if (this.error) {
            return this.error.toString();
        }

        return '';
    }
}

export class DotnetAcquisitionInstallError extends DotnetAcquisitionError {
    constructor(private readonly error: ExecException, version: string) {
        super(version);
    }

    public getErrorMessage(): string {
        return `Exit code: ${this.error.code}
Message: ${this.error.message}`;
    }
}

export class DotnetAcquisitionScriptError extends DotnetAcquisitionError {
    constructor(private readonly error: string, version: string) {
        super(version);
    }

    public getErrorMessage(): string {
        return this.error;
    }
}

export class DotnetAcquisitionCompleted implements IEvent {
    public readonly type = EventType.DotnetAcquisitionCompleted;

    constructor(public readonly version: string, public readonly dotnetPath: string) {
    }
}

export class DotnetUninstallAllStarted implements IEvent {
    public readonly type = EventType.DotnetUninstallAllStart;
}

export class DotnetUninstallAllCompleted implements IEvent {
    public readonly type = EventType.DotnetUninstallAllCompleted;
}

export class DotnetVersionResolutionError implements IEvent {
    public readonly type = EventType.DotnetVersionResolutionError;

    constructor(public readonly error: string) {}
}

export class DotnetVersionResolutionCompleted implements IEvent {
    public readonly type = EventType.DotnetVersionResolutionCompleted;
}

export class DotnetInstallScriptAcquisitionError implements IEvent {
    public readonly type = EventType.DotnetInstallScriptAcquisitionError;

    constructor(public readonly error: string) {}
}

export class DotnetInstallScriptAcquisitionCompleted implements IEvent {
    public readonly type = EventType.DotnetInstallScriptAcquisitionCompleted;
}

export class WebRequestError implements IEvent {
    public readonly type = EventType.WebRequestError;

    constructor(public readonly error: string) {}
}

export class TestAcquireCalled implements IEvent {
    public readonly type = EventType.DotnetAcquisitionTest;

    constructor(public readonly context: IDotnetInstallationContext) {}
}
