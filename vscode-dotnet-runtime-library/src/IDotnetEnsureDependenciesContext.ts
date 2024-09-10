/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as cp from 'child_process';
import { EnsureDependenciesErrorConfiguration } from './Utils/ErrorHandler';

export interface IDotnetEnsureDependenciesContext {
    command: string;
    arguments: cp.SpawnSyncOptionsWithStringEncoding;
    errorConfiguration?: EnsureDependenciesErrorConfiguration;
}
