/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as semver from 'semver';
import { isNullOrUndefined } from 'util';
import { Memento } from 'vscode';
import { IEventStream } from './EventStream';
import { DotnetVersionResolutionCompleted, DotnetVersionResolutionError } from './EventStreamEvents';
import { IVersionResolver } from './IVersionResolver';
import { ReleasesResult } from './ReleasesResult';
import { WebRequestWorker } from './WebRequestWorker';

export class VersionResolver implements IVersionResolver { // tODO add tests for caching?
    protected webWorker: WebRequestWorker;
    private readonly releasesKey = 'releases';
    private readonly releasesUrl = 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json';

    constructor(extensionState: Memento,
                private readonly eventStream: IEventStream) {
        this.webWorker = new WebRequestWorker(extensionState, eventStream, this.releasesUrl, this.releasesKey);
    }

    public async getFullVersion(version: string): Promise<string> { // TODO add test where the response can't be deserialized to releasesResult
        try {
            const response = await this.webWorker.getCachedData();
            const releasesVersions = new ReleasesResult(response);

            const versionResult = this.resolveVersion(version, releasesVersions);
            this.eventStream.post(new DotnetVersionResolutionCompleted());
            return versionResult;
        } catch (error) {
            this.eventStream.post(new DotnetVersionResolutionError(error));
            throw error;
        }
    }

    private resolveVersion(version: string, releases: ReleasesResult): string {
        this.validateVersionInput(version);

        const channel = releases.releasesIndex.filter((channelVal) => channelVal.channelVersion === version);
        if (isNullOrUndefined(channel) || channel.length !== 1) {
            throw new Error(`Unable to resolve version: ${version}`);
        }
        const runtimeVersion = channel[0].latestRuntime;
        return runtimeVersion;
    }

    private validateVersionInput(version: string) {
        const parsedVer = semver.coerce(version);
        if (version.split('.').length !== 2 || isNullOrUndefined(parsedVer)) {
            throw new Error(`Invalid version: ${version}`);
        }
    }
}
