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
exports.GlobalSDKInstallerResolver = void 0;
const WebRequestWorker_1 = require("../Utils/WebRequestWorker");
const os = require("os");
const path = require("path");
const VersionResolver_1 = require("./VersionResolver");
/**
 * @remarks
 * This is similar to the version resolver but accepts a wider range of inputs such as '6', '6.1', or '6.0.3xx' or '6.0.301'.
 * It currently only is used for SDK Global acquistion to prevent breaking existing behaviors.
 * Throws various errors in the event that a version is incorrectly formatted, the sdk server is unavailable, etc.
 */
class GlobalSDKInstallerResolver {
    constructor(extensionState, eventStream, requestedVersion) {
        this.extensionState = extensionState;
        this.eventStream = eventStream;
        /**
         * @remarks Do NOT set this unless you are testing.
         * Written to allow mock data to be given to the resolver.
         */
        this.customWebRequestWorker = null;
        this.requestedVersion = requestedVersion;
        this.discoveredInstallerUrl = '';
        this.fullySpecifiedVersionRequested = '';
    }
    /**
     *
     * @returns The url to the installer for the sdk that matches the machine os and architecture, as well as for the requestedVersion.
     */
    getInstallerUrl() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.discoveredInstallerUrl === '') {
                this.discoveredInstallerUrl = yield this.routeRequestToProperVersionRequestType(this.requestedVersion);
            }
            return this.discoveredInstallerUrl;
        });
    }
    /**
     *
     * @returns the fully specified version in a standardized format that was requested.
     */
    getFullVersion() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.fullySpecifiedVersionRequested === '') {
                this.discoveredInstallerUrl = yield this.routeRequestToProperVersionRequestType(this.requestedVersion);
            }
            return this.fullySpecifiedVersionRequested;
        });
    }
    /**
     *
     * @returns Returns '' if no conflicting version was found on the machine.
     * Returns the existing version if a global install with the requested version already exists.
     * OR: If a global install exists for the same band with a higher version.
     * For non-windows cases: there may only be one dotnet allowed in root, and we need to TODO: get a PM decision on what to do for this.
     */
    GlobalInstallWithConflictingVersionAlreadyExists() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.fullySpecifiedVersionRequested === '') {
                this.discoveredInstallerUrl = yield this.routeRequestToProperVersionRequestType(this.requestedVersion);
            }
            const sdks = []; // this.getGlobalSdksInstalledOnMachine();
            for (let sdk of sdks) {
                if ( // side by side installs of the same major.minor and band can cause issues in some cases. So we decided to just not allow it
                Number(VersionResolver_1.VersionResolver.getMajorMinor(this.fullySpecifiedVersionRequested)) === Number(VersionResolver_1.VersionResolver.getMajorMinor(sdk)) &&
                    Number(VersionResolver_1.VersionResolver.getFeatureBandFromVersion(this.fullySpecifiedVersionRequested)) === Number(VersionResolver_1.VersionResolver.getFeatureBandFromVersion(sdk)) &&
                    Number(VersionResolver_1.VersionResolver.getFeatureBandPatchVersion(this.fullySpecifiedVersionRequested)) <= Number(VersionResolver_1.VersionResolver.getFeatureBandPatchVersion(sdk)) // TODO add architecture check as well...
                ) {
                    return sdk;
                }
            }
            return '';
            // todo move this to distro or os specific code
        });
    }
    /**
     *
     * @remarks this function maps the input version to a singular, specific and correct format based on the accepted version formats for global sdk installs.
     * @param version The requested version given to the API.
     * @returns The installer download URL for the correct OS, Architecture, & Specific Version based on the given input version.
     */
    routeRequestToProperVersionRequestType(version) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isNonSpecificMajorOrMajorMinorVersion(version)) {
                const numberOfPeriods = version.split('.').length - 1;
                const indexUrl = this.getIndexUrl(numberOfPeriods == 0 ? version + '.0' : version);
                const indexJsonData = yield this.fetchJsonObjectFromUrl(indexUrl);
                this.fullySpecifiedVersionRequested = indexJsonData['latest-sdk'];
                return yield this.findCorrectInstallerUrl(this.fullySpecifiedVersionRequested, indexUrl);
            }
            else if (this.isNonSpecificFeatureBandedVersion(version)) {
                this.fullySpecifiedVersionRequested = yield this.getNewestSpecificVersionFromFeatureBand(version);
                return yield this.findCorrectInstallerUrl(this.fullySpecifiedVersionRequested, this.getIndexUrl(VersionResolver_1.VersionResolver.getMajorMinor(this.fullySpecifiedVersionRequested)));
            }
            else if (this.isFullySpecifiedVersion(version)) {
                this.fullySpecifiedVersionRequested = version;
                const indexUrl = this.getIndexUrl(VersionResolver_1.VersionResolver.getMajorMinor(this.fullySpecifiedVersionRequested));
                return yield this.findCorrectInstallerUrl(this.fullySpecifiedVersionRequested, indexUrl);
            }
            throw Error(`The version requested: ${version} is not in a valid format.`);
        });
    }
    /**
     *
     * @remarks this function handles finding the right os, arch url for the installer.
     * @param specificVersion the full, specific version, e.g. 7.0.301 to get.
     * @param indexUrl The url of the index server that hosts installer downlod links.
     * @returns The installer url to download.
     */
    findCorrectInstallerUrl(specificVersion, indexUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            if (specificVersion === null || specificVersion === undefined || specificVersion == "") {
                throw Error(`The requested version ${specificVersion} or resolved version is invalid.`);
            }
            const operatingSys = os.platform();
            const operatingArch = os.arch();
            let convertedOs = "";
            let convertedArch = "";
            switch (operatingSys) {
                case 'win32': {
                    convertedOs = 'win';
                    break;
                }
                case 'darwin': {
                    convertedOs = 'osx';
                    break;
                }
                case 'linux': {
                    convertedOs = operatingSys;
                    break;
                }
                default:
                    {
                        throw Error(`The OS ${operatingSys} is currently unsupported or unknown.`);
                    }
            }
            switch (operatingArch) {
                case 'x64': {
                    convertedArch = operatingArch;
                    break;
                }
                case 'x32': {
                    convertedArch = 'x86';
                    break;
                }
                case 'arm': {
                    convertedArch = operatingArch;
                    break;
                }
                case 'arm64': {
                    convertedArch = operatingArch;
                    break;
                }
                default:
                    {
                        throw Error(`The architecture ${operatingArch} is currently unsupported or unknown.`);
                    }
            }
            const desiredRidPackage = convertedOs + '-' + convertedArch;
            const indexJson = yield this.fetchJsonObjectFromUrl(indexUrl);
            const releases = indexJson['releases'];
            if (releases.length == 0) {
                throw Error(`The releases json format used by ${indexUrl} is invalid or has changed, and the extension needs to be updated.`);
            }
            let sdks = [];
            releases.forEach(function (release) {
                sdks.push.apply(sdks, release['sdks']);
            });
            for (let sdk of sdks) {
                const thisSDKVersion = sdk['version'];
                if (thisSDKVersion === specificVersion) // NOTE that this will not catch things like -preview or build number suffixed versions.
                 {
                    const thisSDKFiles = sdk['files'];
                    for (let installer of thisSDKFiles) {
                        if (installer['rid'] == desiredRidPackage && this.installerMatchesDesiredFileExtension(installer, convertedOs)) {
                            const installerUrl = installer['url'];
                            if (installerUrl === undefined) {
                                throw Error(`URL for ${desiredRidPackage} on ${specificVersion} is unavailable: The version may be Out of Support, or the releases json format used by ${indexUrl} may be invalid and the extension needs to be updated.`);
                            }
                            return installerUrl;
                        }
                    }
                    throw Error(`An installer for the runtime ${desiredRidPackage} could not be found for version ${specificVersion}.`);
                }
            }
            throw Error(`The SDK installation files for version ${specificVersion} running on ${desiredRidPackage} couldn't be found. Is the version in support? Note that -preview versions or versions with build numbers aren't yet supported.`);
        });
    }
    /**
     *
     * @param majorMinor the major.minor in the form of '3.1', etc.
     * @returns the url to obtain the installer for the version.
     */
    getIndexUrl(majorMinor) {
        return 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/' + majorMinor + '/releases.json';
    }
    /**
     * @remarks The releases json may contain both zips and exes or others that match the RID.
     * We need to make sure we get the desired file type for each OS.
     *
     * @returns true if the filetype of the installer json entry containing the installer file name in the key 'name' is of a desired installer file extension type.
     * (e.g. EXE on windows or PKG on mac.)
     */
    installerMatchesDesiredFileExtension(installerJson, operatingSystemInDotnetFormat) {
        const installerFileName = installerJson['name'];
        if (installerFileName === undefined) {
            throw Error(`The json data provided was invalid: ${installerJson}.`);
        }
        let desiredFileExtension = "";
        switch (operatingSystemInDotnetFormat) {
            case 'win': {
                desiredFileExtension = '.exe';
                break;
            }
            case 'osx': {
                desiredFileExtension = '.pkg';
                break;
            }
            case 'linux': {
                desiredFileExtension = '.gz';
                break;
            }
            default:
                {
                    throw Error(`The SDK Extension failed to map the OS ${operatingSystemInDotnetFormat} to a proper package type.`);
                }
        }
        return path.extname(installerFileName) === desiredFileExtension;
    }
    /**
     *
     * @param version the non-specific version, such as 6.0.4xx.
     * @param band The band of the version.
     */
    getNewestSpecificVersionFromFeatureBand(version) {
        return __awaiter(this, void 0, void 0, function* () {
            const band = VersionResolver_1.VersionResolver.getFeatureBandFromVersion(version);
            const indexUrl = this.getIndexUrl(VersionResolver_1.VersionResolver.getMajorMinor(version));
            // Get the sdks
            const indexJson = yield this.fetchJsonObjectFromUrl(indexUrl);
            const releases = indexJson['releases'];
            if (releases.length == 0) {
                throw Error(`The releases json format used by ${indexUrl} is invalid or has changed, and the extension needs to be updated.`);
            }
            // Assumption: The first release in releases will be the newest release and contain the newest sdk for each feature band. This has been 'confirmed' with the releases team.
            const sdks = releases[0]['sdks'];
            for (let sdk of sdks) {
                // The SDKs in the index should be in-order, so we can rely on that property.
                // The first one we find with the given feature band will also be the 'newest.'
                const thisSDKVersion = sdk['version'];
                if (VersionResolver_1.VersionResolver.getFeatureBandFromVersion(thisSDKVersion) === band) {
                    return thisSDKVersion;
                }
            }
            throw Error(`A version for the requested feature band ${band} under the series ${version} couldn't be found.`);
        });
    }
    /**
     *
     * @param url The url containing raw json data to parse.
     * @returns a serizled JSON object.
     */
    fetchJsonObjectFromUrl(url) {
        return __awaiter(this, void 0, void 0, function* () {
            const webWorker = this.customWebRequestWorker ? this.customWebRequestWorker : new WebRequestWorker_1.WebRequestWorker(this.extensionState, this.eventStream);
            const jsonStringData = yield webWorker.getCachedData(url, 1); // 1 retry should be good enough.
            if (jsonStringData === undefined) {
                throw Error(`The requested url ${url} is unreachable.`);
            }
            return JSON.parse(jsonStringData);
        });
    }
    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF version is of an expected length and format.
     */
    isValidLongFormVersionFormat(version) {
        const numberOfPeriods = version.split('.').length - 1;
        // 9 is used to prevent bad versions (current expectation is 7 but we want to support .net 10 etc)
        return numberOfPeriods == 2 && version.length < 9;
    }
    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF version is a feature band with an unspecified sub-version was given e.g. 6.0.4xx or 6.0.40x
     */
    isNonSpecificFeatureBandedVersion(version) {
        return version.split(".").slice(0, 2).every(x => this.isNumber(x)) && version.endsWith('x') && this.isValidLongFormVersionFormat(version);
    }
    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF a major release represented as an integer was given. e.g. 6, which we convert to 6.0, OR a major minor was given, e.g. 6.1.
     */
    isFullySpecifiedVersion(version) {
        return version.split(".").every(x => this.isNumber(x)) && this.isValidLongFormVersionFormat(version);
    }
    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF version is a specific version e.g. 7.0.301.
     */
    isNonSpecificMajorOrMajorMinorVersion(version) {
        const numberOfPeriods = version.split('.').length - 1;
        return this.isNumber(version) && numberOfPeriods >= 0 && numberOfPeriods < 2;
    }
    /**
     *
     * @param value the string to check and see if it's a valid number.
     * @returns true if it's a valid number.
     */
    isNumber(value) {
        return ((value != null) &&
            (value !== '') &&
            !isNaN(Number(value.toString())));
    }
}
exports.GlobalSDKInstallerResolver = GlobalSDKInstallerResolver;
//# sourceMappingURL=GlobalSDKInstallerResolver.js.map