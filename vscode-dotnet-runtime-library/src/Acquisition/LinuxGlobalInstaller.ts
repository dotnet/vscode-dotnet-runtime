/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { IGlobalInstaller } from './IGlobalInstaller';
import { DotnetDistroSupportStatus, LinuxVersionResolver } from './LinuxVersionResolver';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';

export class LinuxGlobalInstaller extends IGlobalInstaller {


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
        await this.linuxSDKResolver.Initialize();

        const dotnetFolder = await this.linuxSDKResolver.distroSDKProvider!.getDotnetVersionSupportStatus(specificSDKVersionInstalled) === DotnetDistroSupportStatus.Distro ?
            await this.linuxSDKResolver.distroSDKProvider!.getExpectedDotnetDistroFeedInstallationDirectory() :
            await this.linuxSDKResolver.distroSDKProvider!.getExpectedDotnetMicrosoftFeedInstallationDirectory();
        return dotnetFolder;
    }

    public async getGlobalSdkVersionsInstalledOnMachine(): Promise<string[]>
    {
        await this.linuxSDKResolver.Initialize();
        return this.linuxSDKResolver.distroSDKProvider!.getInstalledDotnetSDKVersions();
    }

}