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
exports.WinMacSDKInstaller = void 0;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
const fs = require("fs");
const os = require("os");
const path = require("path");
const proc = require("child_process");
const https = require("https");
const FileUtilities_1 = require("../Utils/FileUtilities");
const ISDKInstaller_1 = require("./ISDKInstaller");
/**
 * @remarks
 * This class manages global .NET SDK installations for windows and mac.
 * Both of these OS's have official installers that we can download and run on the machine.
 * Since Linux does not, it is delegated into its own set of classes.
 */
class WinMacSDKInstaller extends ISDKInstaller_1.ISDKInstaller {
    constructor(installerUrl) {
        super();
        this.installerUrl = installerUrl;
    }
    installSDK() {
        return __awaiter(this, void 0, void 0, function* () {
            const installerFile = yield this.downloadInstaller(this.installerUrl);
            const installerResult = yield this.executeInstall(installerFile);
            FileUtilities_1.FileUtilities.wipeDirectory(path.dirname(installerFile));
            return installerResult;
        });
    }
    /**
     *
     * @param installerUrl the url of the installer to download.
     * @returns the path to the installer which was downloaded into a directory managed by us.
     */
    downloadInstaller(installerUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            const ourInstallerDownloadFolder = ISDKInstaller_1.ISDKInstaller.getDownloadedInstallFilesFolder();
            FileUtilities_1.FileUtilities.wipeDirectory(ourInstallerDownloadFolder);
            const installerPath = path.join(ourInstallerDownloadFolder, `${installerUrl.split('/').slice(-1)}`);
            yield this.download(installerUrl, installerPath);
            return installerPath;
        });
    }
    download(url, dest) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const installerDir = path.dirname(dest);
                if (!fs.existsSync(installerDir)) {
                    fs.mkdirSync(installerDir);
                }
                const file = fs.createWriteStream(dest, { flags: "wx" });
                const request = https.get(url, response => {
                    if (response.statusCode === 200) {
                        response.pipe(file);
                    }
                    else {
                        file.close();
                        fs.unlink(dest, () => { }); // Delete temp file
                        reject(`Server responded with ${response.statusCode}: ${response.statusMessage}`);
                    }
                });
                request.on("error", err => {
                    file.close();
                    fs.unlink(dest, () => { }); // Delete temp file
                    reject(err.message);
                });
                file.on("finish", () => {
                    resolve();
                });
                file.on("error", err => {
                    file.close();
                    if (err.message === "EEXIST") {
                        reject("File already exists");
                    }
                    else {
                        fs.unlink(dest, () => { }); // Delete temp file
                        reject(err.message);
                    }
                });
            });
        });
    }
    getExpectedGlobalSDKPath(specificSDKVersionInstalled, installedArch) {
        return __awaiter(this, void 0, void 0, function* () {
            if (os.platform() === 'win32') {
                if (installedArch === 'x32') {
                    return path.join(`C:\\Program Files (x86)\\dotnet\\sdk\\`, specificSDKVersionInstalled, "dotnet.dll");
                }
                else if (installedArch === 'x64') {
                    return path.join(`C:\\Program Files\\dotnet\\sdk\\`, specificSDKVersionInstalled, "dotnet.dll");
                }
            }
            else if (os.platform() === 'darwin') {
                if (installedArch !== 'x64') {
                    return path.join(`/usr/local/share/dotnet/sdk`, specificSDKVersionInstalled);
                }
                else {
                    // We only know this to be correct in the ARM scenarios but I decided to assume the default is the same elsewhere.
                    return path.join(`/usr/local/share/dotnet/x64/dotnet/sdk`, specificSDKVersionInstalled);
                }
            }
            throw Error(`The operating system is unsupported.`);
        });
    }
    /**
     *
     * @param installerPath The path to the installer file to run.
     * @returns The exit result from running the global install.
     */
    executeInstall(installerPath) {
        return __awaiter(this, void 0, void 0, function* () {
            if (os.platform() === 'darwin') {
                // For Mac:
                // We don't rely on the installer because it doesn't allow us to run without sudo, and we don't want to handle the user password.
                // The -W flag makes it so we wait for the installer .pkg to exit, though we are unable to get the exit code.
                try {
                    const commandResult = proc.spawnSync('open', ['-W', `${path.resolve(installerPath)}`]);
                    return commandResult.toString();
                }
                catch (error) {
                    return error;
                }
            }
            else {
                try {
                    const commandResult = proc.spawnSync(`${path.resolve(installerPath)}`, FileUtilities_1.FileUtilities.isElevated() ? ['/quiet', '/install', '/norestart'] : []);
                    return commandResult.toString();
                }
                catch (error) {
                    return error;
                }
            }
        });
    }
    /**
     *
     * @param registryQueryResult the raw output of a registry query converted into a string
     * @returns
     */
    extractVersionsOutOfRegistryKeyStrings(registryQueryResult) {
        return registryQueryResult.split(" ")
            .filter(function (value, i) { return value != '' && i != 0; } // Filter out the whitespace & query as the query return value starts with the query.
        )
            .filter(function (value, i) { return i % 3 == 0; } // Every 0th, 4th, etc item will be a value name AKA the SDK version. The rest will be REGTYPE and REGHEXVALUE.
        );
    }
    /**
     *
     * @returns an array containing fully specified / specific versions of all globally installed sdks on the machine in windows for 32 and 64 bit sdks.
     * TODO: Expand this function to work with mac.
     */
    getGlobalSdkVersionsInstalledOnMachine() {
        return __awaiter(this, void 0, void 0, function* () {
            const sdks = [];
            if (os.platform() === 'win32') {
                const sdkInstallRecords64Bit = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\dotnet\\Setup\\InstalledVersions\\x64\\sdk';
                const sdkInstallRecords32Bit = sdkInstallRecords64Bit.replace('x64', 'x86');
                const queries = [sdkInstallRecords32Bit, sdkInstallRecords64Bit];
                for (let query of queries) {
                    try {
                        const registryQueryCommand = `%SystemRoot%\\System32\\reg.exe`;
                        // stdio settings: don't print registry key DNE warnings as they may not be on the machine if no SDKs are installed and we dont want to error.
                        const installRecordKeysOfXBit = proc.spawnSync(registryQueryCommand, [`query`, `"${query}"`], { stdio: ['pipe', 'ignore', 'ignore'] }).toString();
                        const installedSdks = this.extractVersionsOutOfRegistryKeyStrings(installRecordKeysOfXBit);
                        sdks.concat(installedSdks);
                    }
                    catch (e) {
                        // There are no "X" bit sdks on the machine.
                    }
                }
            }
            return sdks;
        });
    }
}
exports.WinMacSDKInstaller = WinMacSDKInstaller;
//# sourceMappingURL=WinMacSDKInstaller.js.map