/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IEventStream } from '../EventStream/EventStream';

export abstract class IInstallationValidator {
    constructor(protected readonly eventStream: IEventStream) {}

    public abstract validateDotnetInstall(version: string, dotnetPath: string, isDotnetFolder? : boolean): void;
}
