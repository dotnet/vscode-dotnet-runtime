/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExecException } from 'child_process';
import { EventType } from './EventType';
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
