/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IExistingPath } from '../IExtensionContext';

export interface IDotnetCoreAcquisitionWorker {
    uninstallAll(): void;

    resolveExistingPath(existingPaths: IExistingPath[] | undefined, extensionId: string | undefined, windowDisplayWorker: IWindowDisplayWorker): IDotnetAcquireResult | undefined;

    acquire(version: string): Promise<IDotnetAcquireResult>;
}
