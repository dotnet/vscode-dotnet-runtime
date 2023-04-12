import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { IEventStream } from '../EventStream/EventStream';
import { IExtensionState } from '../IExtensionState';
import { DotnetVersionResolutionError } from '../EventStream/EventStreamEvents';
import { DotnetVersionResolutionCompleted } from '../EventStream/EventStreamEvents';
import * as os from 'os';
import * as cp from 'child_process';

/**
 * @remarks
 * This is similar to the version resolver but accepts a wider range of inputs such as '6', '6.1', or '6.0.3xx' or '6.0.301'.
 * It currently only is used for SDK Global acquistion to prevent breaking existing behaviors.
 * Throws various errors in the event that a version is incorrectly formatted, the sdk server is unavailable, etc.
 */
export class GlobalSDKInstallerResolver {
    // The unparsed version into given to the API to request a version of the SDK.
    private requestedVersion : string;

    // The url for a the installer matching the machine os and arch of the system running the extension
    private discoveredInstallerUrl : string;

    // The resolved version that was requested.
    private specificVersionRequested : string;

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
        this.specificVersionRequested = '';
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
     * @returns the fully specified version in a standardized format that was requested.
     */
    public async getFullVersion(): Promise<string>
    {
        if(this.specificVersionRequested === '')
        {
            this.discoveredInstallerUrl = await this.routeRequestToProperVersionRequestType(this.requestedVersion);
        }
        return this.specificVersionRequested;
    }

    /**
     *
     * @returns Returns '' if no conflicting version was found on the machine.
     * Returns the existing version if a global install with the requested version already exists.
     * OR: If a global install exists for the same band with a higher version.
     * For non-windows cases: there may only be one dotnet allowed in root, and we need to TODO: get a PM decision on what to do for this.
     */
    public async GlobalInstallWithConflictingVersionAlreadyExists() : Promise<string>
    {
        if(this.specificVersionRequested === '')
        {
            this.discoveredInstallerUrl = await this.routeRequestToProperVersionRequestType(this.requestedVersion);
        }

        const sdks : Array<string> = this.getGlobalSdksInstalledOnMachine();
        sdks.forEach((sdk: string) =>
        {
            if
            ( // side by side installs of the same major.minor and band can cause issues in some cases. So we decided to just not allow it
                this.getMajorMinor(this.specificVersionRequested) === this.getMajorMinor(sdk) &&
                this.getFeatureBandFromVersion(this.specificVersionRequested) === this.getFeatureBandFromVersion(sdk) &&
                this.specificVersionRequested <= sdk
            )
            {
                return sdk;
            }
        });

        return '';
    }

    /**
     *
     * @remarks this function maps the input version to a singular, specific and correct format based on the accepted version formats for global sdk installs.
     * @param version The requested version given to the API.
     * @returns The installer download URL for the correct OS, Architecture, & Specific Version based on the given input version.
     */
    private async routeRequestToProperVersionRequestType(version : string) : Promise<string> {
        if(this.isNonSpecificMajorOrMajorMinorVersion(version))
        {
            const numberOfPeriods = version.split('.').length - 1;
            const indexUrl = this.getIndexUrl(numberOfPeriods == 0 ? version + '.0' : version);
            const indexJsonData = await this.fetchJsonObjectFromUrl(indexUrl);
            this.specificVersionRequested = indexJsonData['latest-sdk'];
            return await this.findCorrectInstallerUrl(this.specificVersionRequested, indexUrl);
        }
        else if(this.isNonSpecificFeatureBandedVersion(version))
        {
            this.specificVersionRequested = await this.getNewestSpecificVersionFromFeatureBand(version);
            return await this.findCorrectInstallerUrl(this.specificVersionRequested, this.getIndexUrl(this.getMajorMinor(this.specificVersionRequested)));
        }
        else if(this.isFullySpecifiedVersion(version))
        {
            this.specificVersionRequested = version;
            const indexUrl = this.getIndexUrl(this.getMajorMinor(this.specificVersionRequested));
            return await this.findCorrectInstallerUrl(this.specificVersionRequested, indexUrl);
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
        }

        const desiredRidPackage = convertedOs + '-' + convertedArch;

        const indexJson =  await this.fetchJsonObjectFromUrl(indexUrl);
        const sdks = indexJson['releases']['sdks'];

        sdks.forEach((sdk: { [x: string]: any; }) => {
            const thisSDKVersion : string = sdk['version'];
            if(thisSDKVersion === specificVersion) // NOTE that this will not catch things like -preview or build number suffixed versions.
            {
               const thisSDKFiles = sdk['files'];
               thisSDKFiles.array.forEach((installer: { [x: string]: any; }) => {
                    if(installer['rid'] == desiredRidPackage)
                    {
                        return installer['url'];
                    }
               });
            }
        });

        throw Error(`The requested version ${specificVersion} or resolved version is invalid. Note that -preview versions or versions with build numbers aren't yet supported.`);
    }

    /**
     *
     * @param fullVersion the fully specified version, e.g. 7.0.301 to get the major minor from.
     * @returns the major.minor in the form of '3.1', etc.
     */
    private getMajorMinor(fullVersion : string) : string
    {
        return fullVersion.substring(0, 3);
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
     *
     * @returns an array containing fully specified / specific versions of all globally installed sdks on the machine in windows for 32 and 64 bit sdks.
     * TODO: Expand this function to work with linux.
     */
    private getGlobalSdksInstalledOnMachine() : Array<string>
    {
        const sdks: string[] = [];

        if (os.platform() === 'win32')
        {
            const sdkInstallRecords64Bit = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\dotnet\\Setup\\InstalledVersions\\x64\\sdk';
            const sdkInstallRecords32Bit = sdkInstallRecords64Bit.replace('x64', 'x86');
            const installRecordKeys64Bit = cp.execSync(`%SystemRoot%\\System32\\reg.exe query "${sdkInstallRecords64Bit}"`).toString();
            const installRecordKeys32Bit = cp.execSync(`%SystemRoot%\\System32\\reg.exe query "${sdkInstallRecords32Bit}"`).toString();
            installRecordKeys64Bit.concat(installRecordKeys32Bit).split("").forEach( function (regData : string)
                {
                    sdks.push(regData);
                }
            );
        }

        return sdks;
    }

    /**
     *
     * @param version the version of the sdk.. either fully specified or not, but containing a band definition.
     * @returns a single string representing the band number.
     */
    private getFeatureBandFromVersion(version : string) : string
    {
        const band : string | undefined = version.split('.').at(2)?.charAt(0);
        if(band === undefined)
        {
            throw Error(`A feature band couldn't be determined for the requested version ${version}.`)
        }
        return band;
    }

    /**
     *
     * @param version the non-specific version, such as 6.0.4xx.
     * @param band The band of the version.
     */
    private async getNewestSpecificVersionFromFeatureBand(version : string) : Promise<string>
    {
        const band : string = this.getFeatureBandFromVersion(version);
        const indexUrl : string = this.getIndexUrl(this.getMajorMinor(version));

        // Get the sdks
        const indexJson =  await this.fetchJsonObjectFromUrl(indexUrl);
        const sdks = indexJson['releases']['sdks'];
        sdks.forEach((sdk: { [x: string]: any; }) => {
            // The SDKs in the index should be in-order, so we can rely on that property.
            // The first one we find with the given feature band will also be the 'newest.'
            const thisSDKVersion : string = sdk['version'];
            if(this.getFeatureBandFromVersion(thisSDKVersion) === band)
            {
                return thisSDKVersion;
            }
        });

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

    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF version is of an expected length and format.
     */
    private isValidLongFormVersionFormat(version : string) : boolean
    {
        const numberOfPeriods = version.split('.').length - 1;
        // 9 is used to prevent bad versions (current expectation is 7 but we want to support .net 10 etc)
        return numberOfPeriods == 2 && version.length < 9;
    }

    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF version is a feature band with an unspecified sub-version was given e.g. 6.0.4xx or 6.0.40x
     */
    private isNonSpecificFeatureBandedVersion(version : string) : boolean
    {
        return version.split(".").slice(0, 2).every(x => this.isNumber(x)) && version.endsWith('x') && this.isValidLongFormVersionFormat(version);
    }

    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF a major release represented as an integer was given. e.g. 6, which we convert to 6.0, OR a major minor was given, e.g. 6.1.
     */
    private isFullySpecifiedVersion(version : string) : boolean
    {
        return version.split(".").every(x => this.isNumber(x)) && this.isValidLongFormVersionFormat(version);
    }

    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF version is a specific version e.g. 7.0.301.
     */
    private isNonSpecificMajorOrMajorMinorVersion(version : string) : boolean
    {
        const numberOfPeriods = version.split('.').length - 1;
        return this.isNumber(version) && numberOfPeriods > 0 && numberOfPeriods < 2;
    }

    /**
     *
     * @param value the string to check and see if it's a valid number.
     * @returns true if it's a valid number.
     */
    private isNumber(value: string | number): boolean
    {
        return (
            (value != null) &&
            (value !== '') &&
            !isNaN(Number(value.toString()))
        );
    }
}
