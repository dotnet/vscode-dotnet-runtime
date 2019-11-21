/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as request from 'request-promise-native';
import * as semver from 'semver';
import { isNullOrUndefined } from 'util';
import { IVersionResolver } from './IVersionResolver';
import { ReleasesResult } from './ReleasesResult';

export class VersionResolver implements IVersionResolver {
    public resolveVersion(version: string, releases: ReleasesResult): string {
        this.validateVersionInput(version);

        const channel = releases.releases_index.filter((channel) => channel.channel_version === version);
        if (isNullOrUndefined(channel) || channel.length != 1) {
            throw new Error('Unable to resolve version: ' + version)
        }
        const runtimeVersion = channel[0].latest_runtime;
        return runtimeVersion;
    }

    public async getReleasesResult(): Promise<ReleasesResult> {
        var options = {
            uri: 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json'
        };

        return request.get(options).then(response => {
            const releasesResult = new ReleasesResult(response);
            return releasesResult;
        }).catch((error: Error) => {
            throw new Error("Unable to Resolve Version: " + error.message);
        });
    }

    private validateVersionInput(version: string) {
        const parsedVer = semver.coerce(version);
        if (version.split('.').length != 2 || isNullOrUndefined(parsedVer)) {
            throw new Error('Invalid version: ' + version);
        }
    }
}