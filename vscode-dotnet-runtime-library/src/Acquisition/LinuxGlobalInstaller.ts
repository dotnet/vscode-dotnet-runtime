/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as os from 'os';
import * as path from 'path';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { executeWithLock, getDotnetExecutable } from '../Utils/TypescriptUtilities';
import { GLOBAL_LOCK_PING_DURATION_MS } from './CacheTimeConstants';
import { GetDotnetInstallInfo } from './DotnetInstall';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IGlobalInstaller } from './IGlobalInstaller';
import { DotnetDistroSupportStatus, LinuxVersionResolver } from './LinuxVersionResolver';
import { GLOBAL_INSTALL_STATE_MODIFIER_LOCK } from './StringConstants';


export class LinuxGlobalInstaller extends IGlobalInstaller
{
    private version: string;
    private linuxSDKResolver: LinuxVersionResolver;

    constructor(acquisitionContext: IAcquisitionWorkerContext, utilContext: IUtilityContext, fullySpecifiedDotnetVersion: string)
    {
        super(acquisitionContext, utilContext);
        this.linuxSDKResolver = new LinuxVersionResolver(acquisitionContext, utilContext);
        this.version = fullySpecifiedDotnetVersion;
    }

    public async installSDK(): Promise<string>
    {
        await this.linuxSDKResolver.Initialize();

        return executeWithLock(this.acquisitionContext.eventStream, false, GLOBAL_INSTALL_STATE_MODIFIER_LOCK(this.acquisitionContext.installDirectoryProvider,
            GetDotnetInstallInfo(this.version, 'sdk', 'global', os.arch())), GLOBAL_LOCK_PING_DURATION_MS, this.acquisitionContext.timeoutSeconds * 1000,
            async () =>
            {
                return this.linuxSDKResolver.ValidateAndInstallSDK(this.version);
            },);
    }

    public async uninstallSDK(): Promise<string>
    {
        await this.linuxSDKResolver.Initialize();
        return this.linuxSDKResolver.UninstallSDK(this.version);
    }

    public async getExpectedGlobalSDKPath(specificSDKVersionInstalled: string, installedArch: string, macPathShouldExist = true): Promise<string>
    {
        await this.linuxSDKResolver.Initialize();

        const dotnetFolder = await (await this.linuxSDKResolver.distroCall()).getDotnetVersionSupportStatus(specificSDKVersionInstalled, 'sdk') === DotnetDistroSupportStatus.Distro ?
            (await this.linuxSDKResolver.distroCall()).getExpectedDotnetDistroFeedInstallationDirectory() :
            (await this.linuxSDKResolver.distroCall()).getExpectedDotnetMicrosoftFeedInstallationDirectory();
        return path.join(dotnetFolder, getDotnetExecutable());
    }

    public async getGlobalSdkVersionsInstalledOnMachine(): Promise<string[]>
    {
        await this.linuxSDKResolver.Initialize();

        return (await this.linuxSDKResolver.distroCall()).getInstalledDotnetSDKVersions();
    }

}