/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import {
    DotnetFeatureBandDoesNotExistError,
    DotnetInvalidReleasesJSONError,
    DotnetOfflineFailure,
    DotnetVersionResolutionCompleted,
    DotnetVersionResolutionError,
    DotnetVersionParseEvent
} from '../EventStream/EventStreamEvents';
import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { getInstallKeyFromContext } from '../Utils/InstallKeyGenerator';
import { Debugging } from '../Utils/Debugging';

import { IVersionResolver } from './IVersionResolver';
import { DotnetVersionSupportPhase,
    DotnetVersionSupportStatus,
    IDotnetListVersionsContext,
    IDotnetListVersionsResult,
    IDotnetVersion
} from '../IDotnetListVersionsContext';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
/* tslint:disable:no-any */

export class VersionResolver implements IVersionResolver {
    protected webWorker: WebRequestWorker;
    private readonly releasesUrl = 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json';
    protected static invalidFeatureBandErrorString = `A feature band couldn't be determined for the requested version: `;

    constructor(
        private readonly context : IAcquisitionWorkerContext,
        webWorker?: WebRequestWorker
    )
    {
        this.webWorker = webWorker ?? new WebRequestWorker(context, this.releasesUrl);
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

        const response : any = await this.webWorker.getCachedData();

        return new Promise<IDotnetListVersionsResult>((resolve, reject) =>
        {
            if (!response)
            {
                const offlineError = new Error('Unable to connect to the index server: Cannot find .NET versions.');
                this.context.eventStream.post(new DotnetOfflineFailure(offlineError, getInstallKeyFromContext(this.context.acquisitionContext)));
                reject(offlineError);
            }
            else
            {
                const sdkDetailsJson = response['releases-index'];

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
    private async getFullVersion(version: string, getRuntimeVersion: boolean): Promise<string>
    {
        let releasesVersions : IDotnetListVersionsResult;
        try
        {
            releasesVersions = await this.getReleasesInfo(getRuntimeVersion);
        }
        catch(error)
        {
            throw error;
        }

        return new Promise<string>((resolve, reject) =>
        {
            try
            {
                const versionResult = this.resolveVersion(version, releasesVersions);
                this.context.eventStream.post(new DotnetVersionResolutionCompleted(version, versionResult));
                resolve(versionResult);
            }
            catch (error)
            {
                this.context.eventStream.post(new DotnetVersionResolutionError(error as Error, version));
                reject(error);
            }
        });
    }

    private resolveVersion(version: string, releases: IDotnetListVersionsResult): string {
        Debugging.log(`Resolving the version: ${version}`, this.context.eventStream);
        this.validateVersionInput(version);

        const matchingVersion = releases.filter((availableVersions : IDotnetVersion) => availableVersions.channelVersion === version);
        if (!matchingVersion || matchingVersion.length < 1)
        {
            const err = new DotnetVersionResolutionError(new Error(`The requested and or resolved version is invalid.`), version);
            this.context.eventStream.post(err);
            throw err.error;
        }

        return matchingVersion[0].version;
    }

    private validateVersionInput(version: string)
    {
        let parsedVer;
        try
        {
            parsedVer = semver.coerce(version);
        }
        catch(err)
        {
            parsedVer = null;
        }
        Debugging.log(`Semver parsing passed: ${version}.`, this.context.eventStream);

        if (version.split('.').length !== 2 || !parsedVer)
        {
            Debugging.log(`Resolving the version: ${version} ... it is invalid!`, this.context.eventStream);
            const err = new DotnetVersionResolutionError(new Error(`An invalid version was requested. Version: ${version}`), version);
            this.context.eventStream.post(err);
            throw err.error;
        }
        Debugging.log(`The version ${version} was determined to be valid.`, this.context.eventStream);
    }

    private async getReleasesInfo(getRuntimeVersion : boolean): Promise<IDotnetListVersionsResult>
    {
        const apiContext: IDotnetListVersionsContext = { listRuntimes: getRuntimeVersion };

        const response = await this.GetAvailableDotnetVersions(apiContext);
        if (!response)
        {
            const err = new DotnetInvalidReleasesJSONError(new Error(`We could not reach the releases API ${this.releasesUrl} to download dotnet, is your machine offline or is this website down?`),
                getInstallKeyFromContext(this.context.acquisitionContext));
            this.context.eventStream.post(err);
            throw err.error;
        }

        return response;
    }

    /**
     *
     * @param fullySpecifiedVersion the fully specified version of the sdk, e.g. 7.0.301 to get the major from.
     * @returns the major.minor in the form of '3', etc.
     */
    public getMajor(fullySpecifiedVersion : string) : string
    {
        // The called function will check that we can do the split, so we don't need to check again.
        return this.getMajorMinor(fullySpecifiedVersion).split('.')[0];
    }

    /**
     *
     * @param fullySpecifiedVersion the fully specified version, e.g. 7.0.301 to get the major minor from.
     * @returns the major.minor in the form of '3.1', etc.
     */
    public getMajorMinor(fullySpecifiedVersion : string) : string
    {
        if(fullySpecifiedVersion.split('.').length < 2)
        {
            const event = new DotnetVersionResolutionError(new Error(`The requested version ${fullySpecifiedVersion} is invalid.`), getInstallKeyFromContext(this.context.acquisitionContext));
            this.context.eventStream.post(event);
            throw event.error;
        }

        const majorMinor = `${fullySpecifiedVersion.split('.').at(0)}.${fullySpecifiedVersion.split('.').at(1)}`;
        return majorMinor;
    }

    /**
     *
     * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
     * @returns a single string representing the band number, e.g. 3 in 7.0.301.
     */
    public getFeatureBandFromVersion(fullySpecifiedVersion : string) : string
    {
        const band : string | undefined = fullySpecifiedVersion.split('.')?.at(2)?.charAt(0);
        if(band === undefined)
        {
            const event = new DotnetFeatureBandDoesNotExistError(new Error(`${VersionResolver.invalidFeatureBandErrorString}${fullySpecifiedVersion}.`),
                getInstallKeyFromContext(this.context.acquisitionContext));
            this.context.eventStream.post(event);
            throw event.error;
        }
        return band;
    }

    /**
     *
     * @param fullySpecifiedVersion the version of the sdk, either fully specified or not, but containing a band definition.
     * @returns a single string representing the band patch version, e.g. 12 in 7.0.312.
     */
    public getFeatureBandPatchVersion(fullySpecifiedVersion : string) : string
    {
        return Number(this.getPatchVersionString(fullySpecifiedVersion)).toString();
    }

    /**
     *
     * @remarks the logic for getFeatureBandPatchVersion, except that it returns '01' or '00' instead of the patch number.
     * Not meant for public use.
     */
    private getPatchVersionString(fullySpecifiedVersion : string) : string
    {
        const patch : string | undefined = fullySpecifiedVersion.split('.')?.at(2)?.substring(1);
        if(patch === undefined || !this.isNumber(patch))
        {
            const event = new DotnetFeatureBandDoesNotExistError(new Error(`${VersionResolver.invalidFeatureBandErrorString}${fullySpecifiedVersion}.`),
                getInstallKeyFromContext(this.context.acquisitionContext));
            this.context.eventStream.post(event);
            throw event.error;
        }
        return patch
    }
    /**
     *
     * @param fullySpecifiedVersion the requested version to analyze.
     * @returns true IFF version is of an expected length and format.
     */
      public isValidLongFormVersionFormat(fullySpecifiedVersion : string) : boolean
      {
          const numberOfPeriods = fullySpecifiedVersion.split('.').length - 1;
          // 9 is used to prevent bad versions (current expectation is 7 but we want to support .net 10 etc)
          if(numberOfPeriods === 2 && fullySpecifiedVersion.length < 11)
          {
            if(this.isNonSpecificFeatureBandedVersion(fullySpecifiedVersion) ||
                (this.getPatchVersionString(fullySpecifiedVersion).length <= 2 && this.getPatchVersionString(fullySpecifiedVersion).length > 1))
            {
                return true;
            }

            this.context.eventStream.post(new DotnetVersionParseEvent(`The version has a bad patch number: ${fullySpecifiedVersion}`));
          }

          this.context.eventStream.post(new DotnetVersionParseEvent(`The version has more or less than two periods, or it is too long: ${fullySpecifiedVersion}`));
          return false;
      }

    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF version is a feature band with an unspecified sub-version was given e.g. 6.0.4xx or 6.0.40x
     */
    public isNonSpecificFeatureBandedVersion(version : string) : boolean
    {
        const numberOfPeriods = version.split('.').length - 1;
        return version.split('.').slice(0, 2).every(x => this.isNumber(x)) && version.endsWith('x') && numberOfPeriods === 2;
    }

    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF version is a specific version e.g. 7.0.301.
     */
    public isFullySpecifiedVersion(version : string) : boolean
    {
        return version.split('.').every(x => this.isNumber(x)) && this.isValidLongFormVersionFormat(version) && !this.isNonSpecificFeatureBandedVersion(version);
    }

    /**
     *
     * @param version the requested version to analyze.
     * @returns true IFF a major release represented as an integer was given. e.g. 6, which we convert to 6.0, OR a major minor was given, e.g. 6.1.
     */
    public isNonSpecificMajorOrMajorMinorVersion(version : string) : boolean
    {
        const numberOfPeriods = version.split('.').length - 1;
        return this.isNumber(version) && numberOfPeriods >= 0 && numberOfPeriods < 2;
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
