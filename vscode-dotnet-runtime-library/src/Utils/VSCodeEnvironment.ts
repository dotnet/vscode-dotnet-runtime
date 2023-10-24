/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IVSCodeEnvironment } from './IVSCodeEnvironment';
import * as vscode from 'vscode';

export class VSCodeEnvironment extends IVSCodeEnvironment
{
    constructor()
    {
        super();
    }

    isTelemetryEnabled(): boolean
    {
        return vscode.env.isTelemetryEnabled;
    }
}