/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as fs from 'fs';
import { IExtensionState } from '../IExtensionState';
import { IInstallationDirectoryProvider } from './IInstallationDirectoryProvider';

export class SdkInstallationDirectoryProvider implements IInstallationDirectoryProvider {
    public getDotnetInstallDir(version: string, installDir: string): string {
        return installDir;
    }

    public isBundleInstalled(dotnetPath: string, version: string, extensionState: IExtensionState, installingVersionsKey: string): boolean {
        const installingVersions = extensionState.get<string[]>(installingVersionsKey, []);
        return installingVersions.includes(version) && fs.existsSync(dotnetPath);
    }
}
