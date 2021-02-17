/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import rimraf = require('rimraf');
import * as path from 'path';
import * as os from 'os';

export function uninstallSDKExtension() {
    if (os.platform() === 'win32' && process.env.APPDATA) {
        const installFolderName = process.env._VSCODE_DOTNET_INSTALL_FOLDER || '.dotnet';
        const installPath = path.join(process.env.APPDATA, installFolderName);
        if (fs.existsSync(installPath)) {
            rimraf.sync(installPath);
        }
    }
}

uninstallSDKExtension();
