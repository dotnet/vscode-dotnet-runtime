/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');
import { Memento } from 'vscode';
import { IEventStream } from './EventStream';
import { DotnetAcquisitionStarted, DotnetUninstallAllStarted, DotnetUninstallAllCompleted } from './EventStreamEvents';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { IVersionResolver } from './IVersionResolver';
import { ReleasesResult } from './ReleasesResult';
import { isNullOrUndefined } from 'util';

export class DotnetCoreAcquisitionWorker {
    private readonly installingVersionsKey = 'installing';
    private readonly installDir: string;
    private readonly dotnetExecutable: string;
    private releasesVersions: ReleasesResult | undefined;

    private acquisitionPromises: { [version: string]: Promise<string> | undefined };

    constructor(private readonly storagePath: string,
        private readonly extensionState: Memento,
        private readonly eventStream: IEventStream,
        private readonly acquisitionInvoker: IAcquisitionInvoker, 
        private readonly versionResolver: IVersionResolver) {
        this.installDir = path.join(this.storagePath, '.dotnet');
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.acquisitionPromises = {};
    }

    public async uninstallAll() {
        this.eventStream.post(new DotnetUninstallAllStarted());

        this.acquisitionPromises = {};

        rimraf.sync(this.installDir);

        await this.extensionState.update(this.installingVersionsKey, []);
        
        this.eventStream.post(new DotnetUninstallAllCompleted());
    }

    public async acquire(version: string): Promise<string> {
        if (isNullOrUndefined(this.releasesVersions)) {
            // Have to acquire release version information before continuing
            this.releasesVersions = await this.versionResolver.getReleasesResult();
        } else {
            // Update releases without blocking
            this.versionResolver.getReleasesResult().then((releasesResult) => this.releasesVersions = releasesResult);
        }
        version = this.versionResolver.resolveVersion(version, this.releasesVersions);

        const existingAcquisitionPromise = this.acquisitionPromises[version];
        if (existingAcquisitionPromise) {
            // This version of dotnet is already being acquired. Memoize the promise.

            return existingAcquisitionPromise;
        } else {
            // We're the only one acquiring this version of dotnet, start the acquisition process.

            const acquisitionPromise = this.acquireCore(version).catch((error: Error) => {
                delete this.acquisitionPromises[version];
                throw new Error('Dotnet Core Acquisition Failed: ' + error.message);
            });

            this.acquisitionPromises[version] = acquisitionPromise;
            return acquisitionPromise;
        }
    }

    private async acquireCore(version: string): Promise<string> {
        const installingVersions = this.extensionState.get<string[]>(this.installingVersionsKey, []);
        const partialInstall = installingVersions.indexOf(version) >= 0;
        if (partialInstall) {
            // Partial install, we never updated our extension to no longer be 'installing'.
            // uninstall everything and then re-install.
            await this.uninstall(version);
        }

        const dotnetInstallDir = this.getDotnetInstallDir(version);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);

        if (fs.existsSync(dotnetPath)) {
            // Version requested has already been installed.
            return dotnetPath;
        }

        // We update the extension state to indicate we're starting a .NET Core installation.
        installingVersions.push(version);
        await this.extensionState.update(this.installingVersionsKey, installingVersions);

        const installContext = {
            installDir: dotnetInstallDir,
            version: version,
            dotnetPath: dotnetPath
        } as IDotnetInstallationContext;
        this.eventStream.post(new DotnetAcquisitionStarted(version));
        await this.acquisitionInvoker.installDotnet(installContext);

        // Need to re-query our installing versions because there may have been concurrent acquisitions that
        // changed its value.
        const latestInstallingVersions = this.extensionState.get<string[]>(this.installingVersionsKey, []);
        const versionIndex = latestInstallingVersions.indexOf(version);
        if (versionIndex >= 0) {
            latestInstallingVersions.splice(versionIndex, 1);
            await this.extensionState.update(this.installingVersionsKey, latestInstallingVersions);
        }

        return dotnetPath;
    }
    
    private async uninstall(version: string) {
        delete this.acquisitionPromises[version];

        const dotnetInstallDir = this.getDotnetInstallDir(version);
        rimraf.sync(dotnetInstallDir);

        const installingVersions = this.extensionState.get<string[]>(this.installingVersionsKey, []);
        const versionIndex = installingVersions.indexOf(version);
        if (versionIndex >= 0) {
            installingVersions.splice(versionIndex, 1);
            await this.extensionState.update(this.installingVersionsKey, installingVersions);
        }
    }

    private getDotnetInstallDir(version: string) {
        const dotnetInstallDir = path.join(this.installDir, version)
        return dotnetInstallDir;
    }
}
