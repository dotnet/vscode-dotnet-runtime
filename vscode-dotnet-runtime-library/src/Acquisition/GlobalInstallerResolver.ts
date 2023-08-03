/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { IEventStream } from '../EventStream/EventStream';
import { IExtensionState } from '../IExtensionState';
import * as os from 'os';
import * as path from 'path';
import { VersionResolver } from './VersionResolver';
import { DotnetFeatureBandDoesNotExistError,
        DotnetInvalidReleasesJSONError,
        DotnetNoInstallerFileExistsError,
        DotnetUnexpectedInstallerArchitectureError,
        DotnetUnexpectedInstallerOSError,
        DotnetVersionResolutionError
} from '../EventStream/EventStreamEvents';
import { Debugging } from '../Utils/Debugging';
import { IVersionResolver } from './IVersionResolver';
/* tslint:disable:no-any */
/* tslint:disable:only-arrow-functions */

/**
 * @remarks
 * This is similar to the version resolver but accepts a wider range of inputs such as '6', '6.1', or '6.0.3xx' or '6.0.301'.
 * It currently only is used for SDK Global acquistion to prevent breaking existing behaviors.
 * Throws various errors in the event that a version is incorrectly formatted, the sdk server is unavailable, etc.
 */
export class GlobalInstallerResolver {
    // The unparsed version into given to the API to request a version of the SDK.
    // The word 'version' is 2nd in the name so that it's not auto-completed and mistaken for fullySpecifiedVersionRequested, which is what should be used.
    private requestedVersion : string;

    // The url for a the installer matching the machine os and arch of the system running the extension
    private discoveredInstallerUrl : string;

    // The properly resolved version that was requested in the fully-specified 3-part semver version of the .NET SDK.
    private fullySpecifiedVersionRequested : string;

    private versionResolver : VersionResolver;

    private releasesJsonErrorString = `The API hosting the dotnet releases.json is invalid or has changed and the extension needs to be updated. Invalid API URL: `;
    private badResolvedVersionErrorString = `The requested version was not in the correct format. Allowable formats are
        * <MAJOR> (for example '6')
        * <MAJOR>.<minor> (for example '6.0')
        * <MAJOR>.<minor>.<feature band without patch version> (for example '6.0.4xx')
        * <MAJOR>.<minor>.<patch> (for example '6.0.402')
        * Your version was resolved to: `;
    private releasesJsonKey = 'releases';
    private releasesSdksKey = 'sdks';
    private releasesSdkRidKey = 'rid';
    private releasesSdkFileKey = 'files';
    private releasesSdkVersionKey = 'version';
    private releasesSdkNameKey = 'name';
    private releasesUrlKey = 'url';
    private releasesLatestSdkKey = 'latest-sdk';

    /**
     * @remarks Do NOT set this unless you are testing.
     * Written to allow mock data to be given to the resolver.
     */
    public customWebRequestWorker? : WebRequestWorker | null = null;

    constructor(
        private readonly extensionState: IExtensionState,
        private readonly eventStream: IEventStream,
        requestedVersion : string
    )
    {
        this.requestedVersion = requestedVersion;
        this.discoveredInstallerUrl = '';
        this.fullySpecifiedVersionRequested = '';
        this.versionResolver = new VersionResolver(extensionState, eventStream);
    }


    /**
     *
     * @returns The url to the installer for the sdk that matches the machine os and architecture, as well as for the requestedVersion.
     */
    public async getInstallerUrl(): Promise<string>
    {
        await this.determineVersionAndInstallerUrl();
        return this.discoveredInstallerUrl;
    }

    /**
     *
     * @returns The fully specified version in a standardized format that was requested.
     */
    public async getFullySpecifiedVersion(): Promise<string>
    {
        await this.determineVersionAndInstallerUrl();
        return this.fullySpecifiedVersionRequested;
    }

    private async determineVersionAndInstallerUrl()
    {
        if(this.fullySpecifiedVersionRequested === '' || this.discoveredInstallerUrl === '')
        {
            [this.discoveredInstallerUrl, this.fullySpecifiedVersionRequested] = await this.routeRequestToProperVersionRequestType(this.requestedVersion);
        }
    }

    /**
     *
     * @remarks this function maps the input version to a singular, specific and correct format based on the accepted version formats for global sdk installs.
     * @param version The requested version given to the API.
     * @returns The installer download URL for the correct OS, Architecture, & Specific Version based on the given input version, and then the resolved version we determined to install.
     */
    private async routeRequestToProperVersionRequestType(version : string) : Promise<[string, string]>
    {
        if(this.versionResolver.isNonSpecificMajorOrMajorMinorVersion(version))
        {
            Debugging.log(`The VersionResolver resolved the version to be major, or major.minor.`, this.eventStream);
            const numberOfPeriods = version.split('.').length - 1;
            const indexUrl = this.getIndexUrl(numberOfPeriods === 0 ? `${version}.0` : version);
            const indexJsonData = await this.fetchJsonObjectFromUrl(indexUrl);
            const fullySpecifiedVersionRequested = indexJsonData[this.releasesLatestSdkKey];
            return [await this.findCorrectInstallerUrl(fullySpecifiedVersionRequested, indexUrl), fullySpecifiedVersionRequested];
        }
        else if(this.versionResolver.isNonSpecificFeatureBandedVersion(version))
        {
            Debugging.log(`The VersionResolver resolved the version to be a N.Y.XXX version.`, this.eventStream);
            const fullySpecifiedVersion = await this.getNewestSpecificVersionFromFeatureBand(version);
            return [
                await this.findCorrectInstallerUrl(fullySpecifiedVersion, this.getIndexUrl(this.versionResolver.getMajorMinor(fullySpecifiedVersion))),
                fullySpecifiedVersion
            ];
        }
        else if(this.versionResolver.isFullySpecifiedVersion(version))
        {
            Debugging.log(`The VersionResolver resolved the version to be a fully specified version.`, this.eventStream);
            const fullySpecifiedVersionRequested = version;
            const indexUrl = this.getIndexUrl(this.versionResolver.getMajorMinor(fullySpecifiedVersionRequested));
            return [await this.findCorrectInstallerUrl(fullySpecifiedVersionRequested, indexUrl), fullySpecifiedVersionRequested];
        }

        Debugging.log(`The VersionResolver could not resolve the version, version: ${version}.`, this.eventStream);
        const err = new DotnetVersionResolutionError(new Error(`${this.badResolvedVersionErrorString} ${version}`), version);
        this.eventStream.post(err);
        throw err.error;
    }

    /**
     *
     * @remarks this function handles finding the right os, arch url for the installer.
     * @param specificVersion the full, specific version, e.g. 7.0.301 to get.
     * @param indexUrl The url of the index server that hosts installer downlod links.
     * @returns The installer url to download.
     */
    private async findCorrectInstallerUrl(specificVersion : string, indexUrl : string) : Promise<string>
    {
        if(specificVersion === null || specificVersion === undefined || specificVersion === '')
        {
            const versionErr = new DotnetVersionResolutionError(new Error(`${this.badResolvedVersionErrorString} ${specificVersion}.`), specificVersion);
            this.eventStream.post(versionErr);
            throw versionErr.error;
        }

        const operatingSys : string = os.platform();
        const operatingArch : string = os.arch();

        let convertedOs = '';
        let convertedArch = '';

        switch(operatingSys)
        {
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
                const osErr = new DotnetUnexpectedInstallerOSError(new Error(`The OS ${operatingSys} is currently unsupported or unknown.`));
                this.eventStream.post(osErr);
                throw osErr.error;
            }
        }

        switch(operatingArch)
        {
            case 'x64': {
                convertedArch = operatingArch;
                break;
            }
            case 'ia32': {
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
                const archErr = new DotnetUnexpectedInstallerArchitectureError(new Error(`The architecture ${operatingArch} is currently unsupported or unknown.
                    Your architecture: ${os.arch()}. Your OS: ${os.platform()}.`));
                this.eventStream.post(archErr);
                throw archErr.error;
            }
        }

        const desiredRidPackage = `${convertedOs}-${convertedArch}`;

        const indexJson =  await this.fetchJsonObjectFromUrl(indexUrl);
        const releases = indexJson[this.releasesJsonKey];
        if(releases.length === 0)
        {
            const jsonErr = new DotnetInvalidReleasesJSONError(new Error(`${this.releasesJsonErrorString}${indexUrl}`));
            this.eventStream.post(jsonErr);
            throw jsonErr.error;
        }

        const sdks: any[] = [];
        const releasesKeyAlias = this.releasesSdksKey; // the forEach creates a separate 'this', so we introduce this copy to reduce ambiguity to the compiler

        releases.forEach(function (release : any) {
            sdks.push.apply(sdks, release[releasesKeyAlias]);
        });

        for (const sdk of sdks)
        {
            const thisSDKVersion : string = sdk[this.releasesSdkVersionKey];
            if(thisSDKVersion === specificVersion) // NOTE that this will not catch things like -preview or build number suffixed versions.
            {
               const thisSDKFiles = sdk[this.releasesSdkFileKey];
               for (const installer of thisSDKFiles)
               {
                    if(installer[this.releasesSdkRidKey] === desiredRidPackage && this.installerMatchesDesiredFileExtension(specificVersion, installer, convertedOs))
                    {
                        const installerUrl = installer[this.releasesUrlKey];
                        if(installerUrl === undefined)
                        {
                            const releaseJsonErr = new DotnetInvalidReleasesJSONError(new Error(`URL for ${desiredRidPackage} on ${specificVersion} is unavailable:
                                The version may be Out of Support, or the releases json format used by ${indexUrl} may be invalid and the extension needs to be updated.`));
                            this.eventStream.post(releaseJsonErr);
                            throw releaseJsonErr.error;
                        }
                        return installerUrl;
                    }
                }

                const installerErr = new DotnetNoInstallerFileExistsError(new Error(`An installer for the runtime ${desiredRidPackage} could not be found for version ${specificVersion}.`));
                this.eventStream.post(installerErr);
                throw installerErr.error;
            }
        }

        const fileErr = new DotnetNoInstallerFileExistsError(new Error(`The SDK installation files for version ${specificVersion} running on ${desiredRidPackage} couldn't be found. Is the version in support? Note that -preview versions or versions with build numbers aren't yet supported. Visit https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core for support information.`));
        this.eventStream.post(fileErr);
        throw fileErr.error;
    }

    /**
     *
     * @param majorMinor the major.minor in the form of '3.1', etc.
     * @returns the url to obtain the installer for the version.
     */
    private getIndexUrl(majorMinor : string ) : string
    {
        return `https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/${majorMinor}/releases.json`;
    }

    /**
     * @remarks The releases json may contain both zips and exes or others that match the RID.
     * We need to make sure we get the desired file type for each OS.
     *
     * @returns true if the filetype of the installer json entry containing the installer file name in the key 'name' is of a desired installer file extension type.
     * (e.g. EXE on windows or PKG on mac.)
     */
    private installerMatchesDesiredFileExtension(version : string, installerJson : any, operatingSystemInDotnetFormat : string) : boolean
    {
        const installerFileName = installerJson[this.releasesSdkNameKey];
        if(installerFileName === undefined)
        {
            const err = new DotnetInvalidReleasesJSONError(new Error(`${this.releasesJsonErrorString}
                ${this.getIndexUrl(this.versionResolver.getMajorMinor(version))}.
                The json does not have the parameter ${this.releasesSdkNameKey} which means the API publisher has published invalid dotnet release data. Please file an issue at https://github.com/dotnet/vscode-dotnet-runtime.`));
            this.eventStream.post(err);
            throw err.error;
        }

        let desiredFileExtension = '';

        switch(operatingSystemInDotnetFormat)
        {
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
                const err = new DotnetUnexpectedInstallerOSError(new Error(`The SDK Extension failed to map the OS ${operatingSystemInDotnetFormat} to a proper package type.
                    Your architecture: ${os.arch()}. Your OS: ${os.platform()}.`));
                this.eventStream.post(err);
                throw err.error;
            }
        }

        return path.extname(installerFileName) === desiredFileExtension;
    }

    /**
     *
     * @param version the non-specific version, such as 6.0.4xx.
     * @param band The band of the version.
     */
    private async getNewestSpecificVersionFromFeatureBand(version : string) : Promise<string>
    {
        const band : string = this.versionResolver.getFeatureBandFromVersion(version);
        const indexUrl : string = this.getIndexUrl(this.versionResolver.getMajorMinor(version));

        // Get the sdks
        const indexJson =  await this.fetchJsonObjectFromUrl(indexUrl);
        const releases = indexJson[this.releasesJsonKey]

        if(releases.length === 0)
        {
            const badJsonErr = new DotnetInvalidReleasesJSONError(new Error(`${this.releasesJsonErrorString}${indexUrl}`));
            this.eventStream.post(badJsonErr);
            throw badJsonErr.error;
        }

        // Assumption: The first release in releases will be the newest release and contain the newest sdk for each feature band. This has been 'confirmed' with the releases team.
        const sdks = releases[0][this.releasesSdksKey];
        for (const sdk of sdks)
        {
            // The SDKs in the index should be in-order, so we can rely on that property.
            // The first one we find with the given feature band will also be the 'newest.'
            const thisSDKVersion : string = sdk[this.releasesSdkVersionKey];
            if(this.versionResolver.getFeatureBandFromVersion(thisSDKVersion) === band)
            {
                return thisSDKVersion;
            }
        }

        // TODO: make a test for this error msg
        const availableBands = Array.from(new Set(sdks.map((x : any) => this.versionResolver.getFeatureBandFromVersion(x[this.releasesSdkVersionKey]))));
        const err = new DotnetFeatureBandDoesNotExistError(new Error(`The feature band '${band}' doesn't exist for the SDK major version '${version}'. Available feature bands for this SDK version are ${availableBands}.`));
        this.eventStream.post(err);
        throw err.error;
    }

    /**
     *
     * @param url The url containing raw json data to parse.
     * @returns a serizled JSON object.
     * @remarks A wrapper around the real web request worker class to call into either the mock or real web worker. The main point of this function is  to dedupe logic.
     */
    private async fetchJsonObjectFromUrl(url : string)
    {
        const webWorker = this.customWebRequestWorker ? this.customWebRequestWorker : new WebRequestWorker(this.extensionState, this.eventStream);
        return webWorker.fetchJsonObjectFromUrl(url);
    }
}
