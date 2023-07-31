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
        await this.linuxSDKResolver.Initialize();

        return this.linuxSDKResolver.ValidateAndInstallSDK(this.version);
    }

    public async getExpectedGlobalSDKPath(specificSDKVersionInstalled : string, installedArch : string) : Promise<string>
    {
        await this.linuxSDKResolver.Initialize();

        const dotnetFolder = await (await this.linuxSDKResolver.distroCall()).getDotnetVersionSupportStatus(specificSDKVersionInstalled) === DotnetDistroSupportStatus.Distro ?
            await (await this.linuxSDKResolver.distroCall()).getExpectedDotnetDistroFeedInstallationDirectory() :
            await (await this.linuxSDKResolver.distroCall()).getExpectedDotnetMicrosoftFeedInstallationDirectory();
        return dotnetFolder;
    }

    public async getGlobalSdkVersionsInstalledOnMachine(): Promise<string[]>
    {
        await this.linuxSDKResolver.Initialize();

        return (await this.linuxSDKResolver.distroCall()).getInstalledDotnetSDKVersions();
    }

}