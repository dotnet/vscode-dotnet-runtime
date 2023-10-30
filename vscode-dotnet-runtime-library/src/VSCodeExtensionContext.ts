/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IVSCodeExtensionContext } from './IVSCodeExtensionContext';
import * as vscode from 'vscode';

export class VSCodeExtensionContext extends IVSCodeExtensionContext
{
    private context: vscode.ExtensionContext;

    constructor(trueContext : vscode.ExtensionContext)
    {
        super();
        this.context = trueContext;
    }

    public setVSCodeEnvironmentVariable(variable : string, value : string) : void
    {
        const environment = this.context.environmentVariableCollection;
        environment.replace(variable, value);
    }

    appendToEnvironmentVariable(variable: string, appendingValue: string): void
    {
        const environment = this.context.environmentVariableCollection;
        environment?.append(variable, appendingValue);
    }
}