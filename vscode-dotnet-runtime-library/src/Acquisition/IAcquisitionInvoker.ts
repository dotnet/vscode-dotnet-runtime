/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IEventStream } from '../EventStream/EventStream';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { IInstallationValidator } from './IInstallationValidator';
import { InstallationValidator } from './InstallationValidator';

export abstract class IAcquisitionInvoker {
    public readonly installationValidator: IInstallationValidator;
    constructor(protected readonly eventStream: IEventStream) {
        this.installationValidator = new InstallationValidator(eventStream);
    }

    public abstract installDotnet(installContext: IDotnetInstallationContext): Promise<void>;
}
