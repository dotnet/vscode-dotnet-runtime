import { IEventStream } from '../EventStream/EventStream';
import { IExtensionState } from '../IExtensionState';
import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { IVersionResolver } from './IVersionResolver';
export declare class VersionResolver implements IVersionResolver {
    private readonly eventStream;
    protected webWorker: WebRequestWorker;
    private readonly releasesKey;
    private readonly releasesUrl;
    constructor(extensionState: IExtensionState, eventStream: IEventStream);
    getFullRuntimeVersion(version: string): Promise<string>;
    getFullSDKVersion(version: string): Promise<string>;
    private getFullVersion;
    private resolveVersion;
    private validateVersionInput;
    private getReleasesInfo;
    /**
 *
 * @param fullySpecifiedVersion the fully specified version, e.g. 7.0.301 to get the major from.
 * @returns the major.minor in the form of '3', etc.
 */
    static getMajor(fullVersion: string): string;
    /**
     *
     * @param fullySpecifiedVersion the fully specified version, e.g. 7.0.301 to get the major minor from.
     * @returns the major.minor in the form of '3.1', etc.
     */
    static getMajorMinor(fullySpecifiedVersion: string): string;
    /**
     *
     * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
     * @returns a single string representing the band number, e.g. 3 in 7.0.301.
     */
    static getFeatureBandFromVersion(fullySpecifiedVersion: string): string;
    /**
     *
     * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
     * @returns a single string representing the band patch version, e.g. 12 in 7.0.312.
     */
    static getFeatureBandPatchVersion(fullySpecifiedVersion: string): string;
}
