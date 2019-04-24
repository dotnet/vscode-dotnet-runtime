/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { acquireDotnet } from './AcquireDotnetCommand';
import { dotnetAcquisitionExtensionId } from './DotnetAcquistionId';

export function activate(context: vscode.ExtensionContext) {
    const extension = vscode.extensions.getExtension(dotnetAcquisitionExtensionId);

    if (!extension) {
        throw new Error('Could not resolve dotnet acquisition extension location.');
    }

    const acquireDotnetRegistration = vscode.commands.registerCommand('dotnet.acquire', () => acquireDotnet(extension.extensionPath));

    context.subscriptions.push(acquireDotnetRegistration);
}
