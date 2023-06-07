"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstallationValidator = void 0;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const EventStreamEvents_1 = require("../EventStream/EventStreamEvents");
const IInstallationValidator_1 = require("./IInstallationValidator");
class InstallationValidator extends IInstallationValidator_1.IInstallationValidator {
    validateDotnetInstall(version, dotnetPath) {
        const dotnetValidationFailed = `Validation of .dotnet installation for version ${version} failed:`;
        const folder = path.dirname(dotnetPath);
        this.assertOrThrowError(fs.existsSync(folder), `${dotnetValidationFailed} Expected installation folder ${folder} does not exist.`, version, dotnetPath);
        this.assertOrThrowError(fs.existsSync(dotnetPath), `${dotnetValidationFailed} Expected executable does not exist at "${dotnetPath}"`, version, dotnetPath);
        this.assertOrThrowError(fs.lstatSync(dotnetPath).isFile(), `${dotnetValidationFailed} Expected executable file exists but is not a file: "${dotnetPath}"`, version, dotnetPath);
        this.eventStream.post(new EventStreamEvents_1.DotnetInstallationValidated(version));
    }
    assertOrThrowError(check, message, version, dotnetPath) {
        if (!check) {
            this.eventStream.post(new EventStreamEvents_1.DotnetInstallationValidationError(new Error(message), version, dotnetPath));
            throw new Error(message);
        }
    }
}
exports.InstallationValidator = InstallationValidator;
//# sourceMappingURL=InstallationValidator.js.map