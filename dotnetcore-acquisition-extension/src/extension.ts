/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as acquisitionLibrary from 'dotnetcore-acquisition-library';
import { IExtensionContext } from 'dotnetcore-acquisition-library';
import * as vscode from 'vscode';
import { dotnetCoreAcquisitionExtensionId } from './DotnetCoreAcquistionId';

export function activate(context: vscode.ExtensionContext, extensionContext?: IExtensionContext) {
    acquisitionLibrary.activate(context, dotnetCoreAcquisitionExtensionId, extensionContext);
}
