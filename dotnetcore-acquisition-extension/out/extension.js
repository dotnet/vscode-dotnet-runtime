"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
const acquisitionLibrary = require("dotnetcore-acquisition-library");
const DotnetCoreAcquistionId_1 = require("./DotnetCoreAcquistionId");
function activate(context) {
    acquisitionLibrary.activate(context, DotnetCoreAcquistionId_1.dotnetCoreAcquisitionExtensionId);
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map