/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { ISDKInstaller } from './ISDKInstaller';
import { DotnetDistroSupportStatus, LinuxVersionResolver } from './LinuxVersionResolver';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';

export class LinuxSDKInstaller extends ISDKInstaller {


    private version : string;
    private linuxSDKResolver : LinuxVersionResolver;

    constructor(acqusitionContext : IAcquisitionWorkerContext, fullySpecifiedDotnetVersion : string)
    {
        super(acqusitionContext);
        this.linuxSDKResolver = new LinuxVersionResolver(acqusitionContext);
        this.version = fullySpecifiedDotnetVersion;
    }

    public async installSDK(): Promise<string>
    {
        return await this.linuxSDKResolver.ValidateAndInstallSDK(this.version);
    }

    public async getExpectedGlobalSDKPath(specificSDKVersionInstalled : string, installedArch : string) : Promise<string>
    {
        const dotnetFolder = await this.linuxSDKResolver.distroSDKProvider.getDotnetVersionSupportStatus(specificSDKVersionInstalled) === DotnetDistroSupportStatus.Distro ?
            await this.linuxSDKResolver.distroSDKProvider.getExpectedDotnetDistroFeedInstallationDirectory() :
            await this.linuxSDKResolver.distroSDKProvider.getExpectedDotnetMicrosoftFeedInstallationDirectory();
        return dotnetFolder;
    }

    public getGlobalSdkVersionsInstalledOnMachine(): Promise<string[]>
    {
        return this.linuxSDKResolver.distroSDKProvider.getInstalledDotnetSDKVersions();
    }

}