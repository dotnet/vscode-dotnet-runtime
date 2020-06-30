/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IWindowDisplayWorker } from '../../EventStream/IWindowDisplayWorker';

export class MockWindowDisplayWorker implements IWindowDisplayWorker {
    public errorMessage = '';
    public warningMessage = '';
    public clipboardText = '';
    public options: string[] = [];

    public showErrorMessage(message: string, callback: (response: string| undefined) => void, ...items: string[]): void {
        this.errorMessage = message;
        this.options = items;
    }

    public showWarningMessage(message: string, callback: (response: string| undefined) => void, ...items: string[]): void {
        this.warningMessage = message;
        this.options = items;
    }

    public async copyToUserClipboard(text: string): Promise<void> {
        this.clipboardText = text;
    }
}
