/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');

export function uninstallSDKExtension() {
    const installFolderName = process.env._VSCODE_DOTNET_INSTALL_FOLDER || '.dotnet';
    let installPath: string;
    if (os.platform() === 'win32' && process.env.APPDATA) {
        installPath = path.join(process.env.APPDATA, installFolderName);
    } else if (os.platform() !== 'win32') {
        installPath = path.join(os.homedir(), '.vscode-dotnet-sdk');
    } else {
        return;
    }

    if (fs.existsSync(installPath)) {
        rimraf.sync(installPath);
    }
}

uninstallSDKExtension();
