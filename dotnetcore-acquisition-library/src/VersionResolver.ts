/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as request from 'request-promise-native';
import * as semver from 'semver';
import { isNullOrUndefined } from 'util';
import { IVersionResolver } from './IVersionResolver';

export class VersionResolver implements IVersionResolver {
    public async resolveVersion(version: string): Promise<string> {
        this.validateVersionInput(version);

        const response = await this.getReleasesJson();

        return this.resolveVersionFromJson(response, version);
    }

    protected async getReleasesJson(): Promise<string> {
        var options = {
            uri: 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json'
        };
        return await request.get(options);
    }

    protected resolveVersionFromJson(response: string, version: string): string {
        const cleanJson = response.replace(/[-]/g, '_');
        const resultArray = JSON.parse(cleanJson).releases_index;
        const channel = resultArray.filter((channel: any) => channel.channel_version == version);
        if (isNullOrUndefined(channel) || channel.length != 1) {
            throw new Error('Unable to resolve version: ' + version)
        }
        return channel[0].latest_runtime;
    }

    protected validateVersionInput(version: string) {
        const parsedVer = semver.coerce(version);
        if (version.split('.').length != 2 || isNullOrUndefined(parsedVer)) {
            throw new Error('Invalid version: ' + version);
        }
    }
}