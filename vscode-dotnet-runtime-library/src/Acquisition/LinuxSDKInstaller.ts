/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { ISDKInstaller } from './ISDKInstaller';
import { DotnetGlobalSDKLinuxInstallerResolver } from './DotnetGlobalSDKLinuxInstallerResolver';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';

export class LinuxSDKInstaller extends ISDKInstaller {


    private version : string;
    private linuxSDKResolver : DotnetGlobalSDKLinuxInstallerResolver;

    constructor(context : IAcquisitionWorkerContext, fullySpecifiedDotnetVersion : string)
    {
        super(context);
        this.linuxSDKResolver = new DotnetGlobalSDKLinuxInstallerResolver(context);
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

    public getGlobalSdkVersionsInstalledOnMachine(): Promise<string[]>
    {
        return this.linuxSDKResolver.distroSDKProvider.getInstalledDotnetVersions();
    }

}