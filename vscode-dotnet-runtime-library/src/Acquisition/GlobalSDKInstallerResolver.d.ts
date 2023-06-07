import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { IEventStream } from '../EventStream/EventStream';
import { IExtensionState } from '../IExtensionState';
/**
 * @remarks
 * This is similar to the version resolver but accepts a wider range of inputs such as '6', '6.1', or '6.0.3xx' or '6.0.301'.
 * It currently only is used for SDK Global acquistion to prevent breaking existing behaviors.
 * Throws various errors in the event that a version is incorrectly formatted, the sdk server is unavailable, etc.
 */
export declare class GlobalSDKInstallerResolver {
    private readonly extensionState;
    private readonly eventStream;
    private requestedVersion;
    private discoveredInstallerUrl;
    private fullySpecifiedVersionRequested;
    /**
     * @remarks Do NOT set this unless you are testing.
     * Written to allow mock data to be given to the resolver.
     */
    customWebRequestWorker?: WebRequestWorker | null;
    constructor(extensionState: IExtensionState, eventStream: IEventStream, requestedVersion: string);
    /**
     *
     * @returns The url to the installer for the sdk that matches the machine os and architecture, as well as for the requestedVersion.
     */
    getInstallerUrl(): Promise<string>;
    /**
     *
     * @returns the fully specified version in a standardized format that was requested.
     */
    getFullVersion(): Promise<string>;
    /**
     *
     * @returns Returns '' if no conflicting version was found on the machine.
     * Returns the existing version if a global install with the requested version already exists.
     * OR: If a global install exists for the same band with a higher version.
     * For non-windows cases: there may only be one dotnet allowed in root, and we need to TODO: get a PM decision on what to do for this.
     */
    GlobalInstallWithConflictingVersionAlreadyExists(): Promise<string>;
    /**
     *
     * @remarks this function maps the input version to a singular, specific and correct format based on the accepted version formats for global sdk installs.
     * @param version The requested version given to the API.
     * @returns The installer download URL for the correct OS, Architecture, & Specific Version based on the given input version.
     */
    private routeRequestToProperVersionRequestType;
    /**
     *
     * @remarks this function handles finding the right os, arch url for the installer.
     * @param specificVersion the full, specific version, e.g. 7.0.301 to get.
     * @param indexUrl The url of the index server that hosts installer downlod links.
     * @returns The installer url to download.
     */
    private findCorrectInstallerUrl;
    /**
     *
     * @param majorMinor the major.minor in the form of '3.1', etc.
     * @returns the url to obtain the installer for the version.
     */
    private getIndexUrl;
    /**
     * @remarks The releases json may contain both zips and exes or others that match the RID.
     * We need to make sure we get the desired file type for each OS.
     *
     * @returns true if the filetype of the installer json entry containing the installer file name in the key 'name' is of a desired installer file extension type.
     * (e.g. EXE on windows or PKG on mac.)
     */
    private installerMatchesDesiredFileExtension;
    /**
     *
     * @param version the non-specific version, such as 6.0.4xx.
     * @param band The band of the version.
     */
    private getNewestSpecificVersionFromFeatureBand;
    /**
     *
     * @param url The url containing raw json data to parse.
     * @returns a serizled JSON object.
     */
    private fetchJsonObjectFromUrl;
    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF version is of an expected length and format.
     */
    private isValidLongFormVersionFormat;
    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF version is a feature band with an unspecified sub-version was given e.g. 6.0.4xx or 6.0.40x
     */
    private isNonSpecificFeatureBandedVersion;
    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF a major release represented as an integer was given. e.g. 6, which we convert to 6.0, OR a major minor was given, e.g. 6.1.
     */
    private isFullySpecifiedVersion;
    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF version is a specific version e.g. 7.0.301.
     */
    private isNonSpecificMajorOrMajorMinorVersion;
    /**
     *
     * @param value the string to check and see if it's a valid number.
     * @returns true if it's a valid number.
     */
    private isNumber;
}
