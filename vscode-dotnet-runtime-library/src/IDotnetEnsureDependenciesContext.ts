/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';

export interface IDotnetEnsureDependenciesContext {
    command: string;
    arguments: cp.SpawnSyncOptionsWithStringEncoding | undefined;
}
