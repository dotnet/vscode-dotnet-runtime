/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as semver from 'semver';
import { IEventStream } from '../EventStream/EventStream';
import {
    DotnetOfflineFailure,
    DotnetVersionResolutionCompleted,
    DotnetVersionResolutionError,
} from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';
import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { IVersionResolver } from './IVersionResolver';
import { DotnetVersionSupportPhase,
    DotnetVersionSupportStatus,
    IDotnetListVersionsContext,
    IDotnetListVersionsResult,
    IDotnetVersion
} from '../IDotnetListVersionsContext';

export class VersionResolver implements IVersionResolver {
    protected webWorker: WebRequestWorker;
    private readonly releasesUrl = 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json';

    constructor(extensionState: IExtensionState,
                private readonly eventStream: IEventStream,
                webWorker?: WebRequestWorker
    )
    {
        this.webWorker = webWorker ?? new WebRequestWorker(extensionState, eventStream);
    }

    /**
     * @remarks
     * Use the release.json manifest that contains the newest version of the SDK and Runtime for each major.minor of .NET to get the available versions.
     * Relies on the context listRuntimes to tell if it should get runtime or sdk versions.
     *
     * @params
     * webWorker - This class can use its own web-worker or a custom one for testing purposes.
     *
     * @returns
     * IDotnetListVersionsResult of versions available.
     *
     * @throws
     * Exception if the API service for releases-index.json is unavailable.
     */
    public async GetAvailableDotnetVersions(commandContext: IDotnetListVersionsContext | undefined) : Promise<IDotnetListVersionsResult>
    {
        // If shouldObtainSdkVersions === false, get Runtimes. Else, get Sdks.
        const shouldObtainSdkVersions : boolean = !commandContext?.listRuntimes;
        const availableVersions : IDotnetListVersionsResult = [];

        const response = await this.webWorker.getCachedData(this.releasesUrl);


        return new Promise<IDotnetListVersionsResult>((resolve, reject) =>
        {
            if (!response)
            {
                const offlineError = new Error('Unable to connect to the index server: Cannot find .NET versions.');
                this.eventStream.post(new DotnetOfflineFailure(offlineError, 'any'));
                reject(offlineError);
            }
            else
            {
                const sdkDetailsJson = JSON.parse(response)['releases-index'];

                for(const availableSdk of sdkDetailsJson)
                {
                    if(availableSdk['release-type'] === 'lts' || availableSdk['release-type'] === 'sts')
                    {
                        availableVersions.push({
                                supportStatus: (availableSdk['release-type'] as DotnetVersionSupportStatus),
                                supportPhase: (availableSdk['support-phase'] as DotnetVersionSupportPhase),
                                version: availableSdk[shouldObtainSdkVersions ? 'latest-sdk' : 'latest-runtime'],
                                channelVersion: availableSdk['channel-version']
                            } as IDotnetVersion
                        );
                    }
                }
            }

            resolve(availableVersions);
        });
    }

    public async getFullRuntimeVersion(version: string): Promise<string> {
        return this.getFullVersion(version, true);
    }

    public async getFullSDKVersion(version: string): Promise<string> {
        return this.getFullVersion(version, false);
    }

    /**
     * @param getRuntimeVersion - True for getting the full runtime version, false for the SDk version.
     */
    private async getFullVersion(version: string, getRuntimeVersion: boolean): Promise<string> {
        try {
            const releasesVersions = await this.getReleasesInfo(getRuntimeVersion);
            const versionResult = this.resolveVersion(version, releasesVersions);
            this.eventStream.post(new DotnetVersionResolutionCompleted(version, versionResult));
            return versionResult;
        } catch (error) {
            this.eventStream.post(new DotnetVersionResolutionError(error as Error, version));
            throw error;
        }
    }

    private resolveVersion(version: string, releases: IDotnetListVersionsResult): string {
        this.validateVersionInput(version);

        const matchingVersion = releases.filter((availableVersions : IDotnetVersion) => availableVersions.channelVersion === version);
        if (!matchingVersion || matchingVersion.length < 1) {
            throw new Error(`Unable to resolve version: ${version}`);
        }

        return matchingVersion[0].version;
    }

    private validateVersionInput(version: string) {
        const parsedVer = semver.coerce(version);
        if (version.split('.').length !== 2 || !parsedVer) {
            throw new Error(`Invalid version: ${version}`);
        }
    }

    private async getReleasesInfo(getRuntimeVersion : boolean): Promise<IDotnetListVersionsResult>
    {
        const apiContext: IDotnetListVersionsContext = { listRuntimes: getRuntimeVersion };

        const response = await this.GetAvailableDotnetVersions(apiContext);
        if (!response) {
            throw new Error('Unable to get the full version.');
        }

        return response;
    }

        /**
     *
     * @param fullySpecifiedVersion the fully specified version, e.g. 7.0.301 to get the major from.
     * @returns the major.minor in the form of '3', etc.
     */
    public static getMajor(fullVersion : string) : string
    {
        return VersionResolver.getMajorMinor(fullVersion).substring(0, 1);
    }

    /**
     *
     * @param fullySpecifiedVersion the fully specified version, e.g. 7.0.301 to get the major minor from.
     * @returns the major.minor in the form of '3.1', etc.
     */
    public static getMajorMinor(fullySpecifiedVersion : string) : string
    {
        return fullySpecifiedVersion.substring(0, 3);
    }

    /**
     *
     * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
     * @returns a single string representing the band number, e.g. 3 in 7.0.301.
     */
    public static getFeatureBandFromVersion(fullySpecifiedVersion : string) : string
    {
        const band : string | undefined = fullySpecifiedVersion.split('.').at(2)?.charAt(0);
        if(band === undefined)
        {
            throw Error(`A feature band couldn't be determined for the requested version ${fullySpecifiedVersion}.`)
        }
        return band;
    }

    /**
     *
     * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
     * @returns a single string representing the band patch version, e.g. 12 in 7.0.312.
     */
    public static getFeatureBandPatchVersion(fullySpecifiedVersion : string) : string
    {
        const patch : string | undefined = fullySpecifiedVersion.split('.').at(2)?.substring(1);
        if(patch === undefined)
        {
            throw Error(`A feature band patch version couldn't be determined for the requested version ${fullySpecifiedVersion}.`)
        }
        return patch;
    }
}
