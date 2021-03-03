/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';

export abstract class IInstallationDirectoryProvider {
    constructor(protected storagePath: string) { }

    public abstract getInstallDir(version: string): string;

    public getStoragePath(): string {
        const installFolderName = process.env._VSCODE_DOTNET_INSTALL_FOLDER || '.dotnet';
        return path.join(this.storagePath, installFolderName);
    }
}
