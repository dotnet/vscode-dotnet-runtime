/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as semver from 'semver';
import
{
    DotnetInvalidReleasesJSONError,
    DotnetOfflineFailure,
    DotnetVersionResolutionCompleted,
    DotnetVersionResolutionError,
    EventBasedError,
    EventCancellationError
} from '../EventStream/EventStreamEvents';
import { Debugging } from '../Utils/Debugging';
import { getAssumedInstallInfo, getInstallFromContext } from '../Utils/InstallIdUtilities';
import { WebRequestWorkerSingleton } from '../Utils/WebRequestWorkerSingleton';

import
{
    DotnetVersionSupportPhase,
    DotnetVersionSupportStatus,
    IDotnetListVersionsContext,
    IDotnetListVersionsResult,
    IDotnetVersion
} from '../IDotnetListVersionsContext';
import { DotnetInstallMode } from './DotnetInstallMode';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IVersionResolver } from './IVersionResolver';

export class VersionResolver implements IVersionResolver
{
    protected webWorker: WebRequestWorkerSingleton;
    private readonly releasesUrl = 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/releases-index.json';

    constructor(
        private readonly context: IAcquisitionWorkerContext,
        webWorker?: WebRequestWorkerSingleton
    )
    {
        this.webWorker = webWorker ?? WebRequestWorkerSingleton.getInstance();
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
    public async GetAvailableDotnetVersions(commandContext: IDotnetListVersionsContext | undefined): Promise<IDotnetListVersionsResult>
    {
        const getSdkVersions = !commandContext?.listRuntimes;
        const availableVersions: IDotnetListVersionsResult = [];

        const response: any = await this.webWorker.getCachedData(this.releasesUrl, this.context);

        return new Promise<IDotnetListVersionsResult>((resolve, reject) =>
        {
            if (!response)
            {
                const offlineError = new Error('Unable to connect to the index server: Cannot find .NET versions.');
                this.context.eventStream.post(new DotnetOfflineFailure(offlineError, getInstallFromContext(this.context)));
                reject(offlineError);
            }
            else
            {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const releases = response?.['releases-index'];

                for (const release of releases)
                {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    if (release?.['release-type'] === 'lts' || release?.['release-type'] === 'sts')
                    {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        availableVersions?.push({
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                            supportStatus: (release?.['release-type'] as DotnetVersionSupportStatus) ?? 'sts',
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                            supportPhase: (release?.['support-phase'] as DotnetVersionSupportPhase) ?? 'eol',
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                            version: release?.[getSdkVersions ? 'latest-sdk' : 'latest-runtime'] ?? '0.0',
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                            channelVersion: release?.['channel-version'] ?? '0.0'
                        } as IDotnetVersion
                        );
                    }
                }
            }


            resolve(availableVersions);
        });
    }

    public async getFullVersion(version: string, mode: DotnetInstallMode): Promise<string>
    {
        let releasesVersions: IDotnetListVersionsResult;
        try
        {
            releasesVersions = await this.getReleasesInfo(mode);
        }
        catch (error: any)
        {
            // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            throw new EventBasedError(error, error?.message, error?.stack);
        }

        return new Promise<string>((resolve, reject) =>
        {
            try
            {
                const versionResult = this.resolveVersion(version, releasesVersions);
                this.context.eventStream.post(new DotnetVersionResolutionCompleted(version, versionResult));
                resolve(versionResult);
            }
            catch (error: any)
            {
                // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                this.context.eventStream.post(new DotnetVersionResolutionError(new EventCancellationError('DotnetVersionResolutionError', error?.message ?? ''), getAssumedInstallInfo(version, mode)));
                reject(error as Error);
            }
        });
    }

    private resolveVersion(version: string, releases: IDotnetListVersionsResult): string
    {
        this.validateVersionInput(version);

        // Search for the specific version
        let matchingVersion = releases.filter((availableVersions: IDotnetVersion) => availableVersions.version === version);

        // If a x.y version is given, just find that instead (which is how almost all requests are given atm)
        if (!matchingVersion || (matchingVersion?.length ?? 0) < 1)
        {
            matchingVersion = releases.filter((availableVersions: IDotnetVersion) => availableVersions.channelVersion === version);
        }
        if (!matchingVersion || (matchingVersion?.length ?? 0) < 1)
        {
            const err = new DotnetVersionResolutionError(new EventCancellationError('DotnetVersionResolutionError',
                `The requested and or resolved version is invalid.`),
                getAssumedInstallInfo(version, this.context.acquisitionContext.mode!));
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
        catch (err)
        {
            parsedVer = null;
        }
        Debugging.log(`Semver parsing passed: ${version}.`, this.context.eventStream);

        if (!parsedVer || (version.split('.').length !== 2 && version.split('.').length !== 3))
        {
            Debugging.log(`Resolving the version: ${version} ... it is invalid!`, this.context.eventStream);
            const err = new DotnetVersionResolutionError(new EventCancellationError('DotnetVersionResolutionError',
                `An invalid version was requested. Version: ${version}`),
                getAssumedInstallInfo(version, this.context.acquisitionContext.mode!));
            this.context.eventStream.post(err);
            throw err.error;
        }
        Debugging.log(`The version ${version} was determined to be valid.`, this.context.eventStream);
    }

    private async getReleasesInfo(mode: DotnetInstallMode): Promise<IDotnetListVersionsResult>
    {
        const apiContext: IDotnetListVersionsContext = { listRuntimes: mode === 'runtime' || mode === 'aspnetcore' };

        const response = await this.GetAvailableDotnetVersions(apiContext);
        if (!response)
        {
            const err = new DotnetInvalidReleasesJSONError(new EventBasedError('DotnetInvalidReleasesJSONError', `We could not reach the releases API ${this.releasesUrl} to download dotnet, is your machine offline or is this website down?`),
                getInstallFromContext(this.context));
            this.context.eventStream.post(err);
            throw err.error;
        }

        return response;
    }
}
