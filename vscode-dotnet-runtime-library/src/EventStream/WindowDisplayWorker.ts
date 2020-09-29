/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as os from 'os';
import { env, window } from 'vscode';
import { IWindowDisplayWorker } from './IWindowDisplayWorker';

export class WindowDisplayWorker implements IWindowDisplayWorker {
    private readonly pathPlaceholder = os.platform() === 'win32' ? 'C:\\Program Files\\dotnet\\dotnet.exe' : '/usr/local/share/dotnet/dotnet';
    private readonly pathPrompt = 'Enter the path to the .NET executable. .NET can be installed at aka.ms/dotnet-download';

    public showErrorMessage(message: string, callback: (response: string| undefined) => void, ...items: string[]): void {
        window.showErrorMessage(message, ...items).then(async (response: string | undefined) => callback(response) );
    }

    public showWarningMessage(message: string, callback: (response: string| undefined) => void, ...items: string[]): void {
        window.showWarningMessage(message, ...items).then(async (response: string | undefined) => callback(response) );
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
