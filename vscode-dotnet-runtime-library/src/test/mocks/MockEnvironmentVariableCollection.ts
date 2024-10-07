/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export class MockEnvironmentVariableCollection implements vscode.EnvironmentVariableCollection {

    public persistent =  true;
    public variables: {[variable: string]: string} = {};

    public append(variable: string, value: string): void {
        const envVar = this.variables[variable];
        if (envVar === undefined) {
            this.variables[variable] = value;
        } else {
            this.variables[variable] = this.variables[variable] + value;
        }
    }

    public get(variable: string): vscode.EnvironmentVariableMutator | undefined {
        throw new Error('Method not implemented.');
    }

    public replace(variable: string, value: string): void {
        this.variables[variable] = value;
    }


    public prepend(variable: string, value: string): void {
        throw new Error('Method not implemented.');
    }

    public forEach(callback: (variable: string, mutator: vscode.EnvironmentVariableMutator, collection: vscode.EnvironmentVariableCollection) => any, thisArg?: any): void {
        throw new Error('Method not implemented.');
    }

    public delete(variable: string): void {
        throw new Error('Method not implemented.');
    }

    public clear(): void {
        throw new Error('Method not implemented.');
    }

    [Symbol.iterator](): Iterator<[variable: string, mutator: vscode.EnvironmentVariableMutator], any, undefined> {
        throw new Error('Method not implemented.');
    }
}
