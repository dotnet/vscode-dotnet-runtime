/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as os from 'os';
import * as path from 'path';

import
{
    DotnetFeatureBandDoesNotExistError,
    DotnetFileIntegrityCheckEvent,
    DotnetInvalidReleasesJSONError,
    DotnetNoInstallerFileExistsError,
    DotnetUnexpectedInstallerArchitectureError,
    DotnetUnexpectedInstallerOSError,
    DotnetVersionCategorizedEvent,
    DotnetVersionResolutionError,
    EventBasedError,
    EventCancellationError
} from '../EventStream/EventStreamEvents';
import { FileUtilities } from '../Utils/FileUtilities';
import { getInstallFromContext } from '../Utils/InstallIdUtilities';
import { WebRequestWorkerSingleton } from '../Utils/WebRequestWorkerSingleton';
import { VersionResolver } from './VersionResolver';
import * as versionUtils from './VersionUtilities';

import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
/* eslint-disable @typescript-eslint/no-unsafe-member-access */


/**
 * @remarks
 * This is similar to the version resolver but accepts a wider range of inputs such as '6', '6.1', or '6.0.3xx' or '6.0.301'.
 * It currently only is used for SDK Global acquisition to prevent breaking existing behaviors.
 * Throws various errors in the event that a version is incorrectly formatted, the sdk server is unavailable, etc.
 */
export class GlobalInstallerResolver
{
    // The unparsed version into given to the API to request a version of the SDK.
    // The word 'version' is 2nd in the name so that it's not auto-completed and mistaken for fullySpecifiedVersionRequested, which is what should be used.
    private requestedVersion: string;

    // The url for a the installer matching the machine os and arch of the system running the extension
    private discoveredInstallerUrl: string;

    // The properly resolved version that was requested in the fully-specified 3-part semver version of the .NET SDK.
    private fullySpecifiedVersionRequested: string;

    private expectedInstallerHash: string;

    protected fileUtilities: FileUtilities;

    private versionResolver: VersionResolver;

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
    private releasesHashKey = 'hash';
    private releasesLatestSdkKey = 'latest-sdk';

    /**
     * @remarks Do NOT set this unless you are testing.
     * Written to allow mock data to be given to the resolver.
     */
    public customWebRequestWorker?: WebRequestWorkerSingleton | null = null;

    constructor
        (
            private readonly context: IAcquisitionWorkerContext,
            requestedVersion: string,
        )
    {
        this.requestedVersion = requestedVersion;
        this.discoveredInstallerUrl = '';
        this.fullySpecifiedVersionRequested = '';
        this.expectedInstallerHash = '';
        this.versionResolver = new VersionResolver(context);
        this.fileUtilities = new FileUtilities();
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

    /**
     *
     * @returns The url to the installer for the sdk that matches the machine os and architecture, as well as for the requestedVersion.
     */
    public async getInstallerHash(): Promise<string>
    {
        await this.determineVersionAndInstallerUrl();
        return this.expectedInstallerHash;
    }


    private async determineVersionAndInstallerUrl()
    {
        if (this.fullySpecifiedVersionRequested === '' || this.discoveredInstallerUrl === '')
        {
            [this.discoveredInstallerUrl, this.fullySpecifiedVersionRequested, this.expectedInstallerHash] = await this.routeRequestToProperVersionRequestType(this.requestedVersion);
        }
    }

    /**
     *
     * @remarks this function maps the input version to a singular, specific and correct format based on the accepted version formats for global sdk installs.
     * @param version The requested version given to the API.
     * @returns The installer download URL for the correct OS, Architecture, & Specific Version based on the given input version, and then the resolved version we determined to install,
     * ... followed by the expected hash.
     */
    private async routeRequestToProperVersionRequestType(version: string): Promise<[string, string, string]>
    {
        if (versionUtils.isNonSpecificMajorOrMajorMinorVersion(version))
        {
            this.context.eventStream.post(new DotnetVersionCategorizedEvent(`The VersionResolver resolved the version ${version} to be major, or major.minor.`));
            const numberOfPeriods = version.split('.').length - 1;
            const indexUrl = this.getIndexUrl(numberOfPeriods === 0 ? `${version}.0` : version);
            const indexJsonData = await this.fetchJsonObjectFromUrl(indexUrl);
            const fullySpecifiedVersionRequested = indexJsonData![(this.releasesLatestSdkKey as any)];
            const installerUrlAndHash = await this.findCorrectInstallerUrlAndHash(fullySpecifiedVersionRequested, indexUrl);
            return [installerUrlAndHash[0], fullySpecifiedVersionRequested, installerUrlAndHash[1]];
        }
        else if (versionUtils.isNonSpecificFeatureBandedVersion(version))
        {
            this.context.eventStream.post(new DotnetVersionCategorizedEvent(`The VersionResolver resolved the version ${version} to be a N.Y.XXX version.`));
            const fullySpecifiedVersion = await this.getNewestSpecificVersionFromFeatureBand(version);
            const installerUrlAndHash = await this.findCorrectInstallerUrlAndHash(fullySpecifiedVersion,
                this.getIndexUrl(versionUtils.getMajorMinor(fullySpecifiedVersion, this.context.eventStream, this.context)));
            return [installerUrlAndHash[0], fullySpecifiedVersion, installerUrlAndHash[1]];
        }
        else if (versionUtils.isFullySpecifiedVersion(version, this.context.eventStream, this.context))
        {
            this.context.eventStream.post(new DotnetVersionCategorizedEvent(`The VersionResolver resolved the version ${version} to be a fully specified version.`));
            const fullySpecifiedVersionRequested = version;
            const indexUrl = this.getIndexUrl(versionUtils.getMajorMinor(fullySpecifiedVersionRequested, this.context.eventStream, this.context));
            const installerUrlAndHash = await this.findCorrectInstallerUrlAndHash(fullySpecifiedVersionRequested, indexUrl);
            return [installerUrlAndHash[0], fullySpecifiedVersionRequested, installerUrlAndHash[1]];
        }

        const err = new DotnetVersionResolutionError(new EventCancellationError('DotnetVersionResolutionError',
            `${this.badResolvedVersionErrorString} ${version}`), getInstallFromContext(this.context));
        this.context.eventStream.post(err);
        throw err.error;
    }

    /**
     *
     * @remarks this function handles finding the right os, arch url for the installer.
     * @param specificVersion the full, specific version, e.g. 7.0.301 to get.
     * @param indexUrl The url of the index server that hosts installer download links.
     * @returns The installer url to download as the first item of a tuple and then the expected hash of said installer
     */
    private async findCorrectInstallerUrlAndHash(specificVersion: string, indexUrl: string): Promise<[string, string]>
    {
        if (specificVersion === null || specificVersion === undefined || specificVersion === '')
        {
            const versionErr = new DotnetVersionResolutionError(new EventCancellationError('DotnetVersionResolutionError',
                `${this.badResolvedVersionErrorString} ${specificVersion}.`),
                getInstallFromContext(this.context));
            this.context.eventStream.post(versionErr);
            throw versionErr.error;
        }

        const convertedOs = this.fileUtilities.nodeOSToDotnetOS(os.platform(), this.context.eventStream);
        if (convertedOs === 'auto')
        {
            const osErr = new DotnetUnexpectedInstallerOSError(new EventBasedError('DotnetUnexpectedInstallerOSError',
                `The OS ${os.platform()} is currently unsupported or unknown.`), getInstallFromContext(this.context));
            this.context.eventStream.post(osErr);
            throw osErr.error;
        }

        const convertedArch = this.fileUtilities.nodeArchToDotnetArch(os.arch(), this.context.eventStream);
        if (convertedArch === 'auto')
        {
            const archErr = new DotnetUnexpectedInstallerArchitectureError(new EventBasedError('DotnetUnexpectedInstallerArchitectureError',
                `The architecture ${os.arch()} is currently unsupported or unknown.
                Your architecture: ${os.arch()}. Your OS: ${os.platform()}.`), getInstallFromContext(this.context));
            this.context.eventStream.post(archErr);
            throw archErr.error;
        }

        const desiredRidPackage = `${convertedOs}-${convertedArch}`;

        const indexJson: any = await this.fetchJsonObjectFromUrl(indexUrl);
        const releases = indexJson![this.releasesJsonKey];
        if ((releases?.length ?? 0) === 0)
        {
            const jsonErr = new DotnetInvalidReleasesJSONError(new EventBasedError('DotnetInvalidReleasesJSONError',
                `${this.releasesJsonErrorString}${indexUrl}`), getInstallFromContext(this.context));
            this.context.eventStream.post(jsonErr);
            throw jsonErr.error;
        }

        const sdks: any[] = [];
        const releasesKeyAlias = this.releasesSdksKey; // the forEach creates a separate 'this', so we introduce this copy to reduce ambiguity to the compiler

        releases.forEach(function (release: any)
        {
            // eslint-disable-next-line prefer-spread
            sdks.push.apply(sdks, release[releasesKeyAlias]);
        });

        for (const sdk of sdks)
        {
            const thisSDKVersion: string = sdk[this.releasesSdkVersionKey];
            if (thisSDKVersion === specificVersion) // NOTE that this will not catch things like -preview or build number suffixed versions.
            {
                const thisSDKFiles = sdk[this.releasesSdkFileKey];
                for (const installer of thisSDKFiles)
                {
                    if (installer[this.releasesSdkRidKey] === desiredRidPackage && this.installerMatchesDesiredFileExtension(specificVersion, installer, convertedOs))
                    {
                        const installerUrl = installer[this.releasesUrlKey];
                        if (installerUrl === undefined)
                        {
                            const releaseJsonErr = new DotnetInvalidReleasesJSONError(new EventBasedError('DotnetInvalidReleasesJSONError',
                                `URL for ${desiredRidPackage} on ${specificVersion} is unavailable:
The version may be Out of Support, or the releases json format used by ${indexUrl} may be invalid and the extension needs to be updated.`),
                                getInstallFromContext(this.context));
                            this.context.eventStream.post(releaseJsonErr);
                            throw releaseJsonErr.error;
                        }
                        if (!this.startsWithAny((installerUrl as string), [
                            'https://download.visualstudio.microsoft.com/', 'https://builds.dotnet.microsoft.com/', 'https://ci.dot.net',
                            'https://dotnetcli.blob.core.windows.net/',
                        ]))
                        {
                            const releaseJsonErr = new DotnetInvalidReleasesJSONError(new EventBasedError('DotnetInvalidReleasesJSONError',
                                `The url: ${installerUrl} is hosted on an unexpected domain.
We cannot verify that .NET downloads are hosted in a secure location, so we have rejected .NET. The url should be download.visualstudio.microsoft.com.
Please report this issue so it can be remedied or investigated.`), getInstallFromContext(this.context));
                            this.context.eventStream.post(releaseJsonErr);
                            throw releaseJsonErr.error;
                        }
                        else
                        {
                            this.context.eventStream.post(new DotnetFileIntegrityCheckEvent(`This installer file is hosted on an expected domain https://download.visualstudio.microsoft.com/.`));
                        }

                        let installerHash = installer[this.releasesHashKey];
                        if (!installerHash)
                        {
                            installerHash = null;
                        }
                        return [installerUrl, installerHash];
                    }
                }

                const installerErr = new DotnetNoInstallerFileExistsError(new EventBasedError('DotnetNoInstallerFileExistsError',
                    `An installer for the runtime ${desiredRidPackage} could not be found for version ${specificVersion}.`),
                    getInstallFromContext(this.context));
                this.context.eventStream.post(installerErr);
                throw installerErr.error;
            }
        }

        const fileErr = new DotnetNoInstallerFileExistsError(new EventBasedError('DotnetNoInstallerFileExistsError',
            `The SDK installation files for version ${specificVersion} running on ${desiredRidPackage} couldn't be found.
Is the version in support? Note that -preview versions or versions with build numbers aren't yet supported.
Visit https://dotnet.microsoft.com/platform/support/policy/dotnet-core for support information.`), getInstallFromContext(this.context));
        this.context.eventStream.post(fileErr);
        throw fileErr.error;
    }

    /**
     *
     * @param majorMinor the major.minor in the form of '3.1', etc.
     * @returns the url to obtain the installer for the version.
     */
    private getIndexUrl(majorMinor: string): string
    {
        return `https://builds.dotnet.microsoft.com/dotnet/release-metadata/${majorMinor}/releases.json`;
    }

    /**
     * @remarks The releases json may contain both zips and exes or others that match the RID.
     * We need to make sure we get the desired file type for each OS.
     *
     * @returns true if the filetype of the installer json entry containing the installer file name in the key 'name' is of a desired installer file extension type.
     * (e.g. EXE on windows or PKG on mac.)
     */
    private installerMatchesDesiredFileExtension(version: string, installerJson: any, operatingSystemInDotnetFormat: string): boolean
    {
        const installerFileName = installerJson[this.releasesSdkNameKey];
        if (installerFileName === undefined)
        {
            const err = new DotnetInvalidReleasesJSONError(new EventBasedError('DotnetInvalidReleasesJSONError',
                `${this.releasesJsonErrorString}
                ${this.getIndexUrl(versionUtils.getMajorMinor(version, this.context.eventStream, this.context))}.
The json does not have the parameter ${this.releasesSdkNameKey} which means the API publisher has published invalid dotnet release data.
Please file an issue at https://github.com/dotnet/vscode-dotnet-runtime.`), getInstallFromContext(this.context));
            this.context.eventStream.post(err);
            throw err.error;
        }

        let desiredFileExtension = '';

        switch (operatingSystemInDotnetFormat)
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
                    const err = new DotnetUnexpectedInstallerOSError(new EventBasedError('DotnetUnexpectedInstallerOSError',
                        `The SDK Extension failed to map the OS ${operatingSystemInDotnetFormat} to a proper package type.
Your architecture: ${os.arch()}. Your OS: ${os.platform()}.`), getInstallFromContext(this.context));
                    this.context.eventStream.post(err);
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
    private async getNewestSpecificVersionFromFeatureBand(version: string): Promise<string>
    {
        const band: string = versionUtils.getFeatureBandFromVersion(version, this.context.eventStream, this.context);
        const indexUrl: string = this.getIndexUrl(versionUtils.getMajorMinor(version, this.context.eventStream, this.context));

        // Get the sdks
        const indexJson: any = await this.fetchJsonObjectFromUrl(indexUrl);
        const releases = indexJson[this.releasesJsonKey]

        if ((releases?.length ?? 0) === 0)
        {
            const badJsonErr = new DotnetInvalidReleasesJSONError(new EventBasedError('DotnetInvalidReleasesJSONError',
                `${this.releasesJsonErrorString}${indexUrl}`), getInstallFromContext(this.context));
            this.context.eventStream.post(badJsonErr);
            throw badJsonErr.error;
        }

        // Assumption: The first release in releases will be the newest release and contain the newest sdk for each feature band. This has been 'confirmed' with the releases team.
        const sdks = releases[0][this.releasesSdksKey];
        for (const sdk of sdks)
        {
            // The SDKs in the index should be in-order, so we can rely on that property.
            // The first one we find with the given feature band will also be the 'newest.'
            const thisSDKVersion: string = sdk[this.releasesSdkVersionKey];
            if (versionUtils.getFeatureBandFromVersion(thisSDKVersion, this.context.eventStream, this.context) === band)
            {
                return thisSDKVersion;
            }
        }

        const availableBands: string[] = Array.from(new Set(sdks.map((x: any) => versionUtils.getFeatureBandFromVersion(x[this.releasesSdkVersionKey], this.context.eventStream, this.context))));
        const err = new DotnetFeatureBandDoesNotExistError(new EventBasedError('DotnetFeatureBandDoesNotExistError',
            `The feature band '${band}' doesn't exist for the SDK major version '${version}'.
Available feature bands for this SDK version are ${availableBands}.`), getInstallFromContext(this.context));
        this.context.eventStream.post(err);
        throw err.error;
    }

    private startsWithAny(str: string, substrings: string[]): boolean
    {
        for (const substring of substrings)
        {
            if (str.startsWith(substring))
            {
                return true;
            }
        }
        return false;
    }

    /**
     *
     * @param url The url containing raw json data to parse.
     * @returns a serialized JSON object.
     * @remarks A wrapper around the real web request worker class to call into either the mock or real web worker. The main point of this function is  to dedupe logic.
     */
    private async fetchJsonObjectFromUrl(url: string)
    {
        const webWorker = this.customWebRequestWorker ? this.customWebRequestWorker : WebRequestWorkerSingleton.getInstance();
        return webWorker.getCachedData(url, this.context);
    }
}
