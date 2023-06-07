"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ubuntu22_04DotnetSDKProvider = void 0;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
const proc = require("child_process");
const IDistroDotnetSDKProvider_1 = require("./IDistroDotnetSDKProvider");
class Ubuntu22_04DotnetSDKProvider extends IDistroDotnetSDKProvider_1.IDistroDotnetSDKProvider {
    installDotnet(installContext) {
        return __awaiter(this, void 0, void 0, function* () {
            return false;
        });
    }
    getInstalledGlobalDotnetPathIfExists() {
        return __awaiter(this, void 0, void 0, function* () {
            const commandResult = proc.spawnSync('which', ['dotnet']);
            return commandResult.toString();
        });
    }
    getExpectedDotnetInstallationDirectory() {
        return __awaiter(this, void 0, void 0, function* () {
            return '';
        });
    }
    dotnetPackageExistsOnSystem() {
        return __awaiter(this, void 0, void 0, function* () {
            return false;
        });
    }
    isDotnetVersionSupported() {
        return __awaiter(this, void 0, void 0, function* () {
            return false;
        });
    }
    upgradeDotnet(versionToUpgrade) {
        return __awaiter(this, void 0, void 0, function* () {
            return false;
        });
    }
    uninstallDotnet(versionToUninstall) {
        return __awaiter(this, void 0, void 0, function* () {
            return false;
        });
    }
    getInstalledDotnetVersions() {
        throw new Error('Method not implemented.');
    }
    getInstalledGlobalDotnetVersionIfExists() {
        throw new Error('Method not implemented.');
    }
    getDotnetVersionSupportStatus(fullySpecifiedVersion) {
        throw new Error('Method not implemented.');
    }
}
exports.Ubuntu22_04DotnetSDKProvider = Ubuntu22_04DotnetSDKProvider;
//# sourceMappingURL=Ubuntu22_04DotnetSDKProvider.js.map