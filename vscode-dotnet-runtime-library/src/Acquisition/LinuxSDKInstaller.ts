/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');
import * as proc from 'child_process';
import * as https from 'https';

import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { FileUtilities } from '../Utils/FileUtilities';
import { ISDKInstaller } from './ISDKInstaller';
import { GlobalSDKInstallerResolver } from './GlobalSDKInstallerResolver';
import { DotnetGlobalSDKLinuxInstallerResolver } from './DotnetGlobalSDKLinuxInstallerResolver';

export class LinuxSDKInstaller extends ISDKInstaller {


    private version : string;
    private linuxSDKResolver : DotnetGlobalSDKLinuxInstallerResolver;

    constructor(fullySpecifiedDotnetVersion : string)
    {
        super();
        this.linuxSDKResolver = new DotnetGlobalSDKLinuxInstallerResolver();
        this.version = fullySpecifiedDotnetVersion;
    }

    public async installSDK(): Promise<string>
    {
        return await this.linuxSDKResolver.ValidateAndInstallSDK(this.version);
    }

    public async getExpectedGlobalSDKPath(specificSDKVersionInstalled : string, installedArch : string) : Promise<string>
    {
        let dotnetFolder = await this.linuxSDKResolver.distroSDKProvider.getExpectedDotnetInstallationDirectory();
        return dotnetFolder;
    }

    public getGlobalSdkVersionsInstalledOnMachine(): Promise<string[]> {
        return this.linuxSDKResolver.distroSDKProvider.getInstalledDotnetVersions();
    }

}