/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { IExtensionState } from '../IExtensionState';

export interface IInstallationDirectoryProvider {
    getDotnetInstallDir(version: string, installDir: string): string;

    isBundleInstalled(dotnetPath: string, version: string, extensionState: IExtensionState, installingVersionsKey: string): boolean;
}
