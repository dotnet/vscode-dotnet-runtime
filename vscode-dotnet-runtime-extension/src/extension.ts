/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as acquisitionLibrary from 'vscode-dotnet-runtime-library';
import { IExtensionContext } from 'vscode-dotnet-runtime-library';
import { dotnetCoreAcquisitionExtensionId } from './DotnetCoreAcquistionId';

export function activate(context: vscode.ExtensionContext, extensionContext?: IExtensionContext) {
    acquisitionLibrary.activate(context, dotnetCoreAcquisitionExtensionId, extensionContext);
}
