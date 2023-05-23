"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ISDKInstaller = void 0;
const path = require("path");
class ISDKInstaller {
    constructor() {
    }
    /**
     *
     * @returns The folder where global sdk installers will be downloaded onto the disk.
     */
    static getDownloadedInstallFilesFolder() {
        return path.join(__dirname, 'installers');
    }
}
exports.ISDKInstaller = ISDKInstaller;
//# sourceMappingURL=ISDKInstaller.js.map