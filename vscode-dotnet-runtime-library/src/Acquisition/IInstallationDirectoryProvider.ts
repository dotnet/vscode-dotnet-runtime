/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as path from 'path';

export abstract class IInstallationDirectoryProvider
{
    constructor(protected storagePath: string) {}

    public abstract getInstallDir(installId: string): string;

    public getStoragePath(): string
    {
        const installFolderName = process.env._VSCODE_DOTNET_INSTALL_FOLDER || '.dotnet';
        return path.join(this.storagePath, installFolderName);
    }
}


