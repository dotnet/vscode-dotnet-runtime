/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IVSCodeExtensionContext } from './IVSCodeExtensionContext';
import * as vscode from 'vscode';

export class VSCodeExtensionContext extends IVSCodeExtensionContext
{
    private context: vscode.ExtensionContext;

    constructor(trueContext: vscode.ExtensionContext)
    {
        super();
        this.context = trueContext;
    }

    public setVSCodeEnvironmentVariable(variable: string, value: string): void
    {
        const environment = this.context.environmentVariableCollection;
        environment.replace(variable, value);
    }

    public appendToEnvironmentVariable(variable: string, appendingValue: string): void
    {
        const environment = this.context.environmentVariableCollection;
        environment?.append(variable, appendingValue);
    }

    public registerOnExtensionChange<A extends any[], R>(f: (...args: A) => R, ...args: A): void
    {
        vscode.extensions.onDidChange(() =>
        {
            f(...(args));
        })
    }

    public getExtensions(): readonly vscode.Extension<any>[]
    {
        return vscode.extensions.all;
    }

    public executeCommand(command: string, ...args: any[]): Thenable<any>
    {
        return vscode.commands.executeCommand(command, ...args);
    }
}