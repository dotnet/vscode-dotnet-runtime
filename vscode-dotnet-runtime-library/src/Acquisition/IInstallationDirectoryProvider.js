"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IInstallationDirectoryProvider = void 0;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
const path = require("path");
class IInstallationDirectoryProvider {
    constructor(storagePath) {
        this.storagePath = storagePath;
    }
    getStoragePath() {
        const installFolderName = process.env._VSCODE_DOTNET_INSTALL_FOLDER || '.dotnet';
        return path.join(this.storagePath, installFolderName);
    }
}
exports.IInstallationDirectoryProvider = IInstallationDirectoryProvider;
//# sourceMappingURL=IInstallationDirectoryProvider.js.map