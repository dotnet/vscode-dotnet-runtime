/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as os from 'os';
import { env, window } from 'vscode';
import { IWindowDisplayWorker } from './IWindowDisplayWorker';
/* eslint-disable */ // When editing this file, please remove this and fix the linting concerns.


export class WindowDisplayWorker implements IWindowDisplayWorker {
    private readonly pathPlaceholder = os.platform() === 'win32' ? 'C:\\Program Files\\dotnet\\dotnet.exe' : '/usr/local/share/dotnet/dotnet';
    private readonly pathPrompt = 'Enter the path to the .NET executable. .NET can be installed at aka.ms/dotnet-download';

    public showErrorMessage(message: string, callback: (response: string| undefined) => void, ...items: string[]): void {
        window.showErrorMessage(message, ...items).then(async (response: string | undefined) => callback(response) );
    }

    public showWarningMessage(message: string, callback: (response: string| undefined) => void, ...items: string[]): void {
        window.showWarningMessage(message, ...items).then(async (response: string | undefined) => callback(response) );
    }

    public async getModalWarningResponse(message : string, no : string, yes : string) : Promise<any>
    {
        return window.showWarningMessage(message, { modal: true }, no, yes);
    }

    public showInformationMessage(message: string, callback: (response: string | undefined) => void, ...items: string[]): void {
        window.showInformationMessage(message).then(async (response: string | undefined) => callback(response) );
    }

    public async copyToUserClipboard(text: string): Promise<void> {
        await env.clipboard.writeText(text);
    }

    public displayPathConfigPopUp(): Thenable<string| undefined> {
        return window.showInputBox({ value: this.pathPlaceholder, prompt: this.pathPrompt, ignoreFocusOut: true });
    }
}
