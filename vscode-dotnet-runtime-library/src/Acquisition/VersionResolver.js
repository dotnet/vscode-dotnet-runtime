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
exports.VersionResolver = void 0;
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
const semver = require("semver");
const EventStreamEvents_1 = require("../EventStream/EventStreamEvents");
const WebRequestWorker_1 = require("../Utils/WebRequestWorker");
const ReleasesResult_1 = require("./ReleasesResult");
class VersionResolver {
    constructor(extensionState, eventStream) {
        this.eventStream = eventStream;
        this.releasesKey = 'releases';
        this.releasesUrl = 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json';
        this.webWorker = new WebRequestWorker_1.WebRequestWorker(extensionState, eventStream);
    }
    getFullRuntimeVersion(version) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getFullVersion(version, true);
        });
    }
    getFullSDKVersion(version) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getFullVersion(version, false);
        });
    }
    getFullVersion(version, runtimeVersion) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const releasesVersions = yield this.getReleasesInfo();
                const versionResult = this.resolveVersion(version, releasesVersions, runtimeVersion);
                this.eventStream.post(new EventStreamEvents_1.DotnetVersionResolutionCompleted(version, versionResult));
                return versionResult;
            }
            catch (error) {
                this.eventStream.post(new EventStreamEvents_1.DotnetVersionResolutionError(error, version));
                throw error;
            }
        });
    }
    resolveVersion(version, releases, runtimeVersion) {
        this.validateVersionInput(version);
        const channel = releases.releasesIndex.filter((channelVal) => channelVal.channelVersion === version);
        if (!channel || channel.length !== 1) {
            throw new Error(`Unable to resolve version: ${version}`);
        }
        const versionRes = runtimeVersion ? channel[0].latestRuntime : channel[0].latestSDK;
        return versionRes;
    }
    validateVersionInput(version) {
        const parsedVer = semver.coerce(version);
        if (version.split('.').length !== 2 || !parsedVer) {
            throw new Error(`Invalid version: ${version}`);
        }
    }
    getReleasesInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield this.webWorker.getCachedData(this.releasesUrl);
            if (!response) {
                throw new Error('Unable to get the full version.');
            }
            const releasesVersions = new ReleasesResult_1.ReleasesResult(response);
            return releasesVersions;
        });
    }
    /**
 *
 * @param fullySpecifiedVersion the fully specified version, e.g. 7.0.301 to get the major from.
 * @returns the major.minor in the form of '3', etc.
 */
    static getMajor(fullVersion) {
        return VersionResolver.getMajorMinor(fullVersion).substring(0, 1);
    }
    /**
     *
     * @param fullySpecifiedVersion the fully specified version, e.g. 7.0.301 to get the major minor from.
     * @returns the major.minor in the form of '3.1', etc.
     */
    static getMajorMinor(fullySpecifiedVersion) {
        return fullySpecifiedVersion.substring(0, 3);
    }
    /**
     *
     * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
     * @returns a single string representing the band number, e.g. 3 in 7.0.301.
     */
    static getFeatureBandFromVersion(fullySpecifiedVersion) {
        var _a;
        const band = (_a = fullySpecifiedVersion.split('.').at(2)) === null || _a === void 0 ? void 0 : _a.charAt(0);
        if (band === undefined) {
            throw Error(`A feature band couldn't be determined for the requested version ${fullySpecifiedVersion}.`);
        }
        return band;
    }
    /**
     *
     * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
     * @returns a single string representing the band patch version, e.g. 12 in 7.0.312.
     */
    static getFeatureBandPatchVersion(fullySpecifiedVersion) {
        var _a;
        const patch = (_a = fullySpecifiedVersion.split('.').at(2)) === null || _a === void 0 ? void 0 : _a.substring(1);
        if (patch === undefined) {
            throw Error(`A feature band patch version couldn't be determined for the requested version ${fullySpecifiedVersion}.`);
        }
        return patch;
    }
}
exports.VersionResolver = VersionResolver;
//# sourceMappingURL=VersionResolver.js.map