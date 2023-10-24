/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IVSCodeEnvironment } from './IVSCodeEnvironment';

export interface IUtilityContext {
    ui : IWindowDisplayWorker;
    vsCodeEnv : IVSCodeEnvironment;
}
