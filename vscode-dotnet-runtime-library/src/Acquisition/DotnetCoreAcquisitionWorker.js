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
exports.DotnetCoreAcquisitionWorker = void 0;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
const fs = require("fs");
const os = require("os");
const path = require("path");
const rimraf = require("rimraf");
const EventStreamEvents_1 = require("../EventStream/EventStreamEvents");
const WinMacSDKInstaller_1 = require("./WinMacSDKInstaller");
const LinuxSDKInstaller_1 = require("./LinuxSDKInstaller");
class DotnetCoreAcquisitionWorker {
    constructor(context) {
        this.context = context;
        this.installingVersionsKey = 'installing';
        this.installedVersionsKey = 'installed';
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.timeoutValue = context.timeoutValue;
        this.acquisitionPromises = {};
    }
    uninstallAll() {
        return __awaiter(this, void 0, void 0, function* () {
            this.context.eventStream.post(new EventStreamEvents_1.DotnetUninstallAllStarted());
            this.acquisitionPromises = {};
            this.removeFolderRecursively(this.context.installDirectoryProvider.getStoragePath());
            yield this.context.extensionState.update(this.installingVersionsKey, []);
            yield this.context.extensionState.update(this.installedVersionsKey, []);
            this.context.eventStream.post(new EventStreamEvents_1.DotnetUninstallAllCompleted());
        });
    }
    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    acquireSDK(version) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.acquire(version, false);
        });
    }
    acquireGlobalSDK(installerResolver) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.acquire(yield installerResolver.getFullVersion(), false, installerResolver);
        });
    }
    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    acquireRuntime(version) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.acquire(version, true);
        });
    }
    acquireStatus(version, installRuntime) {
        return __awaiter(this, void 0, void 0, function* () {
            const existingAcquisitionPromise = this.acquisitionPromises[version];
            if (existingAcquisitionPromise) {
                // Requested version is being acquired
                this.context.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionStatusResolved(version));
                return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
            }
            const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(version);
            const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);
            let installedVersions = this.context.extensionState.get(this.installedVersionsKey, []);
            if (installedVersions.length === 0 && fs.existsSync(dotnetPath) && !installRuntime) {
                // The education bundle already laid down a local install, add it to our managed installs
                installedVersions = yield this.managePreinstalledVersion(dotnetInstallDir, installedVersions);
            }
            if (installedVersions.includes(version) && fs.existsSync(dotnetPath)) {
                // Requested version has already been installed.
                this.context.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionStatusResolved(version));
                return { dotnetPath };
            }
            // Version is not installed
            this.context.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionStatusUndefined(version));
            return undefined;
        });
    }
    /**
     *
     * @param version the version to get of the runtime or sdk.
     * @param installRuntime true for runtime acquisition, false for SDK.
     * @param global false for local install, true for global SDK installs.
     * @returns the dotnet acqusition result.
     */
    acquire(version, installRuntime, globalInstallerResolver = null) {
        return __awaiter(this, void 0, void 0, function* () {
            const existingAcquisitionPromise = this.acquisitionPromises[version];
            if (existingAcquisitionPromise) {
                // This version of dotnet is already being acquired. Memoize the promise.
                this.context.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionInProgress(version));
                return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
            }
            else {
                // We're the only one acquiring this version of dotnet, start the acquisition process.
                let acquisitionPromise = null;
                if (globalInstallerResolver !== null) {
                    // We are requesting a global sdk install.
                    acquisitionPromise = this.acquireGlobalCore(globalInstallerResolver).catch((error) => {
                        delete this.acquisitionPromises[version];
                        throw new Error(`.NET Acquisition Failed: ${error.message}`);
                    });
                }
                else {
                    acquisitionPromise = this.acquireCore(version, installRuntime).catch((error) => {
                        delete this.acquisitionPromises[version];
                        throw new Error(`.NET Acquisition Failed: ${error.message}`);
                    });
                }
                this.acquisitionPromises[version] = acquisitionPromise;
                return acquisitionPromise.then((res) => ({ dotnetPath: res }));
            }
        });
    }
    /**
     *
     * @param version The version of the object to acquire.
     * @param installRuntime true if the request is to install the runtime, false for the SDK.
     * @param global false if we're doing a local install, true if we're doing a global install. Only supported for the SDK atm.
     * @returns the dotnet path of the acquired dotnet.
     *
     * @remarks it is called "core" because it is the meat of the actual acquisition work; this has nothing to do with .NET core vs framework.
     */
    acquireCore(version, installRuntime) {
        return __awaiter(this, void 0, void 0, function* () {
            const installingVersions = this.context.extensionState.get(this.installingVersionsKey, []);
            let installedVersions = this.context.extensionState.get(this.installedVersionsKey, []);
            const partialInstall = installingVersions.indexOf(version) >= 0;
            if (partialInstall && installRuntime) {
                // Partial install, we never updated our extension to no longer be 'installing'.
                // uninstall everything and then re-install.
                this.context.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionPartialInstallation(version));
                yield this.uninstallRuntime(version);
            }
            else if (partialInstall) {
                this.context.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionPartialInstallation(version));
                yield this.uninstallAll();
            }
            const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(version);
            const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);
            if (fs.existsSync(dotnetPath) && installedVersions.length === 0) {
                // The education bundle already laid down a local install, add it to our managed installs
                installedVersions = yield this.managePreinstalledVersion(dotnetInstallDir, installedVersions);
            }
            if (installedVersions.includes(version) && fs.existsSync(dotnetPath)) {
                // Version requested has already been installed.
                this.context.installationValidator.validateDotnetInstall(version, dotnetPath);
                this.context.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionAlreadyInstalled(version));
                return dotnetPath;
            }
            // We update the extension state to indicate we're starting a .NET Core installation.
            yield this.addVersionToExtensionState(this.installingVersionsKey, version);
            const installContext = {
                installDir: dotnetInstallDir,
                version,
                dotnetPath,
                timeoutValue: this.timeoutValue,
                installRuntime,
            };
            this.context.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionStarted(version));
            yield this.context.acquisitionInvoker.installDotnet(installContext).catch((reason) => {
                throw Error(`Installation failed: ${reason}`);
            });
            this.context.installationValidator.validateDotnetInstall(version, dotnetPath);
            yield this.removeVersionFromExtensionState(this.installingVersionsKey, version);
            yield this.addVersionToExtensionState(this.installedVersionsKey, version);
            return dotnetPath;
        });
    }
    acquireGlobalCore(globalInstallerResolver) {
        return __awaiter(this, void 0, void 0, function* () {
            const conflictingVersion = yield globalInstallerResolver.GlobalInstallWithConflictingVersionAlreadyExists();
            if (conflictingVersion !== '') {
                throw Error(`An global install is already on the machine with a version that conflicts with the requested version.`);
            }
            // TODO check if theres a partial install from the extension if that can happen
            // TODO fix registry check
            // TODO report installer OK if conflicting exists
            const installingVersion = yield globalInstallerResolver.getFullVersion();
            let installer = os.platform() === 'linux' ? new LinuxSDKInstaller_1.LinuxSDKInstaller(installingVersion) : new WinMacSDKInstaller_1.WinMacSDKInstaller(yield globalInstallerResolver.getInstallerUrl());
            // Indicate that we're beginning to do the install.
            yield this.addVersionToExtensionState(this.installingVersionsKey, installingVersion);
            this.context.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionStarted(installingVersion));
            const installerResult = yield installer.installSDK();
            if (installerResult !== '0') {
                // TODO handle this.
            }
            const installedSDKPath = yield installer.getExpectedGlobalSDKPath(yield globalInstallerResolver.getFullVersion(), os.arch());
            this.context.installationValidator.validateDotnetInstall(installingVersion, installedSDKPath);
            this.context.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionCompleted(installingVersion, installedSDKPath));
            // Remove the indication that we're installing and replace it notifying of the real installation completion.
            yield this.removeVersionFromExtensionState(this.installingVersionsKey, installingVersion);
            yield this.addVersionToExtensionState(this.installedVersionsKey, installingVersion);
            return installedSDKPath;
        });
    }
    uninstallRuntime(version) {
        return __awaiter(this, void 0, void 0, function* () {
            delete this.acquisitionPromises[version];
            const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(version);
            this.removeFolderRecursively(dotnetInstallDir);
            yield this.removeVersionFromExtensionState(this.installedVersionsKey, version);
            yield this.removeVersionFromExtensionState(this.installingVersionsKey, version);
        });
    }
    removeVersionFromExtensionState(key, version) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = this.context.extensionState.get(key, []);
            const versionIndex = state.indexOf(version);
            if (versionIndex >= 0) {
                state.splice(versionIndex, 1);
                yield this.context.extensionState.update(key, state);
            }
        });
    }
    addVersionToExtensionState(key, version) {
        return __awaiter(this, void 0, void 0, function* () {
            const state = this.context.extensionState.get(key, []);
            state.push(version);
            yield this.context.extensionState.update(key, state);
        });
    }
    removeFolderRecursively(folderPath) {
        this.context.eventStream.post(new EventStreamEvents_1.DotnetAcquisitionDeletion(folderPath));
        rimraf.sync(folderPath);
    }
    managePreinstalledVersion(dotnetInstallDir, installedVersions) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Determine installed version(s)
                const versions = fs.readdirSync(path.join(dotnetInstallDir, 'sdk'));
                // Update extension state
                for (const version of versions) {
                    this.context.eventStream.post(new EventStreamEvents_1.DotnetPreinstallDetected(version));
                    yield this.addVersionToExtensionState(this.installedVersionsKey, version);
                    installedVersions.push(version);
                }
            }
            catch (error) {
                this.context.eventStream.post(new EventStreamEvents_1.DotnetPreinstallDetectionError(error));
            }
            return installedVersions;
        });
    }
}
exports.DotnetCoreAcquisitionWorker = DotnetCoreAcquisitionWorker;
//# sourceMappingURL=DotnetCoreAcquisitionWorker.js.map