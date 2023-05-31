/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { DotnetVersionSupportStatus, DotnetVersionSupportPhase, IDotnetListVersionsContext, IDotnetListVersionsResult, IDotnetVersion } from '../IDotnetListVersionsContext';
import { WebRequestWorker } from './WebRequestWorker';

export class DotnetVersionProvider {

    static availableDontetVersionsUrl = 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json';
    static dotnetAvailableVersionsPageUnavailableError = 'The service to request available SDK versions (releases.json) is unavailable.';

    /**
     * @remarks
     * Use the release.json manifest (provided to the webWorker) that contains the newest version of the SDK and Runtime for each major.minor of .NET to get the available versions.
     * Relies on the context listRuntimes to tell if it should get runtime or sdk versions.
     *
     * @returns
     * IDotnetListVersionsResult of versions available.
     *
     * @throws
     * Exception if the API service for releases-index.json is unavailable.
     */
    async GetAvailableDotnetVersions(commandContext: IDotnetListVersionsContext | undefined, webWorker: WebRequestWorker)
    {
        // If shouldObtainSdkVersions === false, get Runtimes. Else, get Sdks.
        const shouldObtainSdkVersions : boolean = commandContext?.listRuntimes === null || commandContext?.listRuntimes === undefined || !commandContext.listRuntimes;

        const availableVersions : IDotnetListVersionsResult = [];
        let response = null;

        try
        {
            response = await webWorker.getCachedData();
        }
        catch(e)
        {
            throw new Error(DotnetVersionProvider.dotnetAvailableVersionsPageUnavailableError);
        }

        if (!response) {
            throw new Error(DotnetVersionProvider.dotnetAvailableVersionsPageUnavailableError);
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

        return availableVersions;
    }
}