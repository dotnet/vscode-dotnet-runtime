/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IWindowDisplayWorker } from '../../EventStream/IWindowDisplayWorker';

export class MockWindowDisplayWorker implements IWindowDisplayWorker {

    public errorMessage = '';
    public warningMessage = '';
    public infoMessage = '';
    public clipboardText = '';
    public options: string[] = [];
    public callback: ((response: string| undefined) => void | Promise<void>) | undefined = undefined;
    constructor(private readonly mockPath = 'MockPath') { }

    public showErrorMessage(message: string, callback: (response: string| undefined) => void | Promise<void>, ...items: string[]): void {
        this.errorMessage = message;
        this.options = items;
        this.callback = callback;
    }

    public showWarningMessage(message: string, callback: (response: string| undefined) => void | Promise<void>, ...items: string[]): void {
        this.warningMessage = message;
        this.options = items;
        this.callback = callback;
    }

    public showInformationMessage(message: string, callback: (response: string | undefined) => void | Promise<void>, ...items: string[]): void {
        this.infoMessage = message;
        this.callback = callback;
    }

    public async copyToUserClipboard(text: string): Promise<void> {
        this.clipboardText = text;
    }

    public displayPathConfigPopUp(): Promise<string> {
        return new Promise((resolve) => { resolve(this.mockPath); });
    }
}
