/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
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
