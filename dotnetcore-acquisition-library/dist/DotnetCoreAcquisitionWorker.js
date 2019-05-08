"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const rimraf = require("rimraf");
const EventStreamEvents_1 = require("./EventStreamEvents");
class DotnetCoreAcquisitionWorker {
    constructor(extensionPath, eventStream) {
        this.extensionPath = extensionPath;
        this.eventStream = eventStream;
        const script = os.platform() === 'win32' ? 'dotnet-install.cmd' : 'dotnet-install.sh';
        this.scriptPath = path.join(this.extensionPath, 'scripts', script);
        this.installDir = path.join(this.extensionPath, '.dotnet');
        this.lockFilePath = path.join(this.extensionPath, 'install.lock');
        this.beginFilePath = path.join(this.extensionPath, 'install.begin');
        this.dotnetPath = path.join(this.installDir, 'dotnet');
        this.acquisitionPromises = {};
    }
    uninstallAll() {
        this.acquisitionPromises = {};
        this.latestAcquisitionPromise = undefined;
        rimraf.sync(this.installDir);
        if (fs.existsSync(this.beginFilePath)) {
            fs.unlinkSync(this.beginFilePath);
        }
        if (fs.existsSync(this.lockFilePath)) {
            fs.unlinkSync(this.lockFilePath);
        }
    }
    acquire(version) {
        const existingAcquisitionPromise = this.acquisitionPromises[version];
        if (existingAcquisitionPromise) {
            // This version of dotnet is already being acquired. Memoize the promise.
            return existingAcquisitionPromise;
        }
        else if (this.latestAcquisitionPromise) {
            // There are other versions of dotnet being acquired. Wait for them to be finish
            // then start the acquisition process.
            const acquisitionPromise = this.latestAcquisitionPromise
                .catch( /* swallow exceptions because listeners to this promise are unrelated. */)
                .finally(() => this.acquireCore(version));
            // We're now the latest acquisition promise
            this.latestAcquisitionPromise = acquisitionPromise;
            this.acquisitionPromises[version] = acquisitionPromise;
            return acquisitionPromise;
        }
        else {
            // We're the only version of dotnet being acquired, start the acquisition process.
            const acquisitionPromise = this.acquireCore(version);
            // We're now the latest acquisition promise
            this.latestAcquisitionPromise = acquisitionPromise;
            this.acquisitionPromises[version] = acquisitionPromise;
            return acquisitionPromise;
        }
    }
    acquireCore(version) {
        return __awaiter(this, void 0, void 0, function* () {
            if (fs.existsSync(this.beginFilePath)) {
                // Partial install, we never wrote the lock file, uninstall everything and then re-install.
                this.uninstallAll();
            }
            const lockFileExists = fs.existsSync(this.lockFilePath);
            if (lockFileExists && !fs.existsSync(this.installDir)) {
                // User nuked the .NET Core tooling install directory and didn't nuke the lock file. We need to clean up
                // all of our informational assets to ensure we work properly.
                this.uninstallAll();
            }
            let installedVersions = [];
            if (lockFileExists) {
                const lockFileVersionsRaw = fs.readFileSync(this.lockFilePath);
                installedVersions = lockFileVersionsRaw.toString().split('|');
            }
            if (version && installedVersions.indexOf(version) >= 0) {
                // Version requested has already been installed.
                return this.dotnetPath;
            }
            // We render the begin lock file to indicate that we're starting a .NET Core installation.
            fs.writeFileSync(this.beginFilePath, version);
            const args = [
                '-InstallDir', this.installDir,
                '-Runtime', 'dotnet',
                '-Version', version,
            ];
            const installCommand = `${this.scriptPath} ${args.join(' ')}`;
            this.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionStarted(version));
            yield this.installDotnet(installCommand);
            if (version) {
                installedVersions.push(version);
            }
            const installedVersionsString = installedVersions.join('|');
            fs.writeFileSync(this.lockFilePath, installedVersionsString);
            if (fs.existsSync(this.beginFilePath)) {
                // This should always exist unless the user mucked with the installation directory. We're just being extra safe here.
                fs.unlinkSync(this.beginFilePath);
            }
            return this.dotnetPath;
        });
    }
    installDotnet(installCommand) {
        return new Promise((resolve, reject) => {
            try {
                cp.exec(installCommand, { cwd: process.cwd(), maxBuffer: 500 * 1024 }, (error, stdout, stderr) => {
                    if (error) {
                        this.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionInstallError(error));
                        reject(error);
                    }
                    else if (stderr && stderr.length > 0) {
                        this.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionScriptError(stderr));
                        reject(stderr);
                    }
                    else {
                        this.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionCompleted(this.dotnetPath));
                        resolve();
                    }
                });
            }
            catch (error) {
                this.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionUnexpectedError(error));
                reject(error);
            }
        });
    }
}
exports.DotnetCoreAcquisitionWorker = DotnetCoreAcquisitionWorker;
//# sourceMappingURL=DotnetCoreAcquisitionWorker.js.map