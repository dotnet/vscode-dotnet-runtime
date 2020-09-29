/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { env, window } from 'vscode';
import { IWindowDisplayWorker } from './IWindowDisplayWorker';

export class WindowDisplayWorker implements IWindowDisplayWorker {
    public showErrorMessage(message: string, callback: (response: string| undefined) => void, ...items: string[]): void {
        window.showErrorMessage(message, ...items).then(async (response: string | undefined) => callback(response) );
    }

    public showWarningMessage(message: string, callback: (response: string| undefined) => void, ...items: string[]): void {
        window.showWarningMessage(message, ...items).then(async (response: string | undefined) => callback(response) );
    }

    public async copyToUserClipboard(text: string): Promise<void> {
        await env.clipboard.writeText(text);
    }
}
