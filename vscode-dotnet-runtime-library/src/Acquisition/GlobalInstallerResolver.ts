import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { IEventStream } from '../EventStream/EventStream';
import { IExtensionState } from '../IExtensionState';
import * as os from 'os';
import * as path from 'path';
import { VersionResolver } from './VersionResolver';

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
    }


    /**
     *
     * @returns The url to the installer for the sdk that matches the machine os and architecture, as well as for the requestedVersion.
     */
    public async getInstallerUrl(): Promise<string>
    {
        if(this.discoveredInstallerUrl === '')
        {
            this.discoveredInstallerUrl = await this.routeRequestToProperVersionRequestType(this.requestedVersion);
        }
        return this.discoveredInstallerUrl;
    }

    /**
     *
     * @returns The fully specified version in a standardized format that was requested.
     */
    public async getFullVersion(): Promise<string>
    {
        if(this.fullySpecifiedVersionRequested === '')
        {
            this.discoveredInstallerUrl = await this.routeRequestToProperVersionRequestType(this.requestedVersion);
        }
        return this.fullySpecifiedVersionRequested;
    }

    /**
     *
     * @remarks this function maps the input version to a singular, specific and correct format based on the accepted version formats for global sdk installs.
     * @param version The requested version given to the API.
     * @returns The installer download URL for the correct OS, Architecture, & Specific Version based on the given input version.
     */
    private async routeRequestToProperVersionRequestType(version : string) : Promise<string> {
        if(VersionResolver.isNonSpecificMajorOrMajorMinorVersion(version))
        {
            const numberOfPeriods = version.split('.').length - 1;
            const indexUrl = this.getIndexUrl(numberOfPeriods == 0 ? version + '.0' : version);
            const indexJsonData = await this.fetchJsonObjectFromUrl(indexUrl);
            this.fullySpecifiedVersionRequested = indexJsonData['latest-sdk'];
            return await this.findCorrectInstallerUrl(this.fullySpecifiedVersionRequested, indexUrl);
        }
        else if(VersionResolver.isNonSpecificFeatureBandedVersion(version))
        {
            this.fullySpecifiedVersionRequested = await this.getNewestSpecificVersionFromFeatureBand(version);
            return await this.findCorrectInstallerUrl(this.fullySpecifiedVersionRequested, this.getIndexUrl(VersionResolver.getMajorMinor(this.fullySpecifiedVersionRequested)));
        }
        else if(VersionResolver.isFullySpecifiedVersion(version))
        {
            this.fullySpecifiedVersionRequested = version;
            const indexUrl = this.getIndexUrl(VersionResolver.getMajorMinor(this.fullySpecifiedVersionRequested));
            return await this.findCorrectInstallerUrl(this.fullySpecifiedVersionRequested, indexUrl);
        }

        throw Error(`The version requested: ${version} is not in a valid format.`)
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
        if(specificVersion === null || specificVersion === undefined || specificVersion == "")
        {
            throw Error(`The requested version ${specificVersion} or resolved version is invalid.`);
        }

        const operatingSys : string = os.platform();
        const operatingArch : string = os.arch();

        let convertedOs = "";
        let convertedArch = "";

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
                throw Error(`The OS ${operatingSys} is currently unsupported or unknown.`);
            }
        }

        switch(operatingArch)
        {
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

        const indexJson =  await this.fetchJsonObjectFromUrl(indexUrl);
        const releases = indexJson['releases'];
        if(releases.length == 0)
        {
            throw Error(`The releases json format used by ${indexUrl} is invalid or has changed, and the extension needs to be updated.`);
        }

        let sdks: any[] = [];
        releases.forEach(function (release : any) {
            sdks.push.apply(sdks, release['sdks']);
        });

        for (let sdk of sdks)
        {
            const thisSDKVersion : string = sdk['version'];
            if(thisSDKVersion === specificVersion) // NOTE that this will not catch things like -preview or build number suffixed versions.
            {
               const thisSDKFiles = sdk['files'];
               for (let installer of thisSDKFiles)
               {
                    if(installer['rid'] == desiredRidPackage && this.installerMatchesDesiredFileExtension(installer, convertedOs))
                    {
                        const installerUrl = installer['url'];
                        if(installerUrl === undefined)
                        {
                            throw Error(`URL for ${desiredRidPackage} on ${specificVersion} is unavailable: The version may be Out of Support, or the releases json format used by ${indexUrl} may be invalid and the extension needs to be updated.`);
                        }
                        return installerUrl;
                    }
                }
                throw Error(`An installer for the runtime ${desiredRidPackage} could not be found for version ${specificVersion}.`);
            }
        }

        throw Error(`The SDK installation files for version ${specificVersion} running on ${desiredRidPackage} couldn't be found. Is the version in support? Note that -preview versions or versions with build numbers aren't yet supported.`);
    }

    /**
     *
     * @param majorMinor the major.minor in the form of '3.1', etc.
     * @returns the url to obtain the installer for the version.
     */
    private getIndexUrl(majorMinor : string ) : string
    {
        return 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/' + majorMinor + '/releases.json';
    }

    /**
     * @remarks The releases json may contain both zips and exes or others that match the RID.
     * We need to make sure we get the desired file type for each OS.
     *
     * @returns true if the filetype of the installer json entry containing the installer file name in the key 'name' is of a desired installer file extension type.
     * (e.g. EXE on windows or PKG on mac.)
     */
    private installerMatchesDesiredFileExtension(installerJson : any, operatingSystemInDotnetFormat : string) : boolean
    {
        const installerFileName = installerJson['name'];
        if(installerFileName === undefined)
        {
            throw Error(`The json data provided was invalid: ${installerJson}.`);
        }

        let desiredFileExtension = "";

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
    private async getNewestSpecificVersionFromFeatureBand(version : string) : Promise<string>
    {
        const band : string = VersionResolver.getFeatureBandFromVersion(version);
        const indexUrl : string = this.getIndexUrl(VersionResolver.getMajorMinor(version));

        // Get the sdks
        const indexJson =  await this.fetchJsonObjectFromUrl(indexUrl);
        const releases = indexJson['releases']

        if(releases.length == 0)
        {
            throw Error(`The releases json format used by ${indexUrl} is invalid or has changed, and the extension needs to be updated.`);
        }

        // Assumption: The first release in releases will be the newest release and contain the newest sdk for each feature band. This has been 'confirmed' with the releases team.
        const sdks = releases[0]['sdks'];
        for (let sdk of sdks)
        {
            // The SDKs in the index should be in-order, so we can rely on that property.
            // The first one we find with the given feature band will also be the 'newest.'
            const thisSDKVersion : string = sdk['version'];
            if(VersionResolver.getFeatureBandFromVersion(thisSDKVersion) === band)
            {
                return thisSDKVersion;
            }
        }

        throw Error(`A version for the requested feature band ${band} under the series ${version} couldn't be found.`);
    }

    /**
     *
     * @param url The url containing raw json data to parse.
     * @returns a serizled JSON object.
     */
    private async fetchJsonObjectFromUrl(url : string)
    {
        const webWorker = this.customWebRequestWorker ? this.customWebRequestWorker : new WebRequestWorker(this.extensionState, this.eventStream);
        const jsonStringData = await webWorker.getCachedData(url, 1); // 1 retry should be good enough.
        if(jsonStringData === undefined)
        {
            throw Error(`The requested url ${url} is unreachable.`);
        }

        return JSON.parse(jsonStringData);
    }
}
