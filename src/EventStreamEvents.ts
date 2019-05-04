/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExecException } from 'child_process';
import { EventType } from './EventType';
import { IEvent } from './IEvent';

// tslint:disable max-classes-per-file

export class DotnetAcquisitionStart implements IEvent {
    public readonly type = EventType.DotnetAcquisitionStart;
}

export class DotnetAcquisitionUnexpectedError implements IEvent {
    public readonly type = EventType.DotnetAcquisitionError;

    constructor(public readonly error: any) {
    }
}

export class DotnetAcquisitionInstallError implements IEvent {
    public readonly type = EventType.DotnetAcquisitionError;

    constructor(public readonly error: ExecException) {
    }
}

export class DotnetAcquisitionScriptError implements IEvent {
    public readonly type = EventType.DotnetAcquisitionError;

    constructor(public readonly error: string) {
    }
}

export class DotnetAcquisitionCompleted implements IEvent {
    public readonly type = EventType.DotnetAcquisitionCompleted;
}
