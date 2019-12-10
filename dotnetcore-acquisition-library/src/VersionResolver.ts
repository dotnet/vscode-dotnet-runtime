/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as request from 'request-promise-native';
import * as semver from 'semver';
import { isNullOrUndefined } from 'util';
import { IVersionResolver } from './IVersionResolver';
import { ReleasesResult } from './ReleasesResult';
import { IEventStream } from './EventStream';
import { DotnetVersionResolutionError, DotnetVersionResolutionCompleted } from './EventStreamEvents';
import * as fs from 'fs';
import * as path from 'path';

export class VersionResolver implements IVersionResolver {
    private releasesVersions: ReleasesResult | undefined;
    protected releasesFile: string;

    constructor(releasesFileLocation: string, 
                private readonly eventStream: IEventStream) {
        this.releasesFile = path.join(releasesFileLocation, "releases.json");
    }

    public async getFullVersion(version: string): Promise<string> {
        try {
            const fileResult = fs.readFileSync(this.releasesFile, 'utf8');
            // Update releases without blocking, continue with cached information
            this.getReleasesResult().then((releasesResult) => this.releasesVersions = releasesResult);
            this.releasesVersions = new ReleasesResult(fileResult);
        } catch {
            // Have to acquire release version information before continuing
            this.releasesVersions = await this.getReleasesResult();
        }

        const versionResult = this.resolveVersion(version, this.releasesVersions);
        this.eventStream.post(new DotnetVersionResolutionCompleted());
        return versionResult;
    }

    private resolveVersion(version: string, releases: ReleasesResult): string {
        this.validateVersionInput(version);

        const channel = releases.releases_index.filter((channel) => channel.channel_version === version);
        if (isNullOrUndefined(channel) || channel.length != 1) {
            throw new Error('Unable to resolve version: ' + version)
        }
        const runtimeVersion = channel[0].latest_runtime;
        return runtimeVersion;
    }

    // Protected for ease of testing
    protected async getReleasesResult(): Promise<ReleasesResult> {
        var options = {
            uri: 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json'
        };

        try {
            const response = await request.get(options);
            // Cache results
            fs.mkdirSync(path.dirname(this.releasesFile), { recursive: true });
            fs.writeFileSync(this.releasesFile, response);
            const releasesResult = new ReleasesResult(response);
            return releasesResult;
        } catch(error) {
            this.eventStream.post(new DotnetVersionResolutionError("Version resolution failed: " + error.message));
            throw new Error("Unable to Resolve Version: " + error.message);
        };
    }

    private validateVersionInput(version: string) {
        const parsedVer = semver.coerce(version);
        if (version.split('.').length != 2 || isNullOrUndefined(parsedVer)) {
            throw new Error('Invalid version: ' + version);
        }
    }
}