/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { IEventStream } from './EventStream';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';

export abstract class IAcquisitionInvoker {
    constructor(protected readonly eventStream: IEventStream) {}

    abstract installDotnet(installContext: IDotnetInstallationContext): Promise<void>
}
