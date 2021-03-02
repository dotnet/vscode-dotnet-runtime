/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as fs from 'fs';
import * as path from 'path';
import { IExtensionState } from '../IExtensionState';
import { IInstallationDirectoryProvider } from './IInstallationDirectoryProvider';

export class RuntimeInstallationDirectoryProvider implements IInstallationDirectoryProvider {
    public getDotnetInstallDir(version: string, installDir: string): string {
        const dotnetInstallDir = path.join(installDir, version);
        return dotnetInstallDir;
    }

    public isBundleInstalled(dotnetPath: string, version: string, extensionState: IExtensionState, installingVersionsKey: string): boolean {
        return fs.existsSync(dotnetPath);
    }
}
