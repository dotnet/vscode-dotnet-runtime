/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

export interface IWindowDisplayWorker
{
    showErrorMessage(message: string, callback: (response: string | undefined) => Promise<void>, ...items: string[]): void;
    showWarningMessage(message: string, callback: (response: string | undefined) => void, ...items: string[]): void;
    getModalWarningResponse(message: string, no: string, yes: string): Promise<any>;
    showInformationMessage(message: string, callback: (response: string | undefined) => void, ...items: string[]): void;
    copyToUserClipboard(text: string): Promise<void>;
    displayPathConfigPopUp(): Thenable<string | undefined>;
}
