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
import { DotnetInstallMode } from './DotnetInstallMode';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IGlobalInstaller } from './IGlobalInstaller';
import { DotnetDistroSupportStatus, LinuxVersionResolver } from './LinuxVersionResolver';
import { GLOBAL_INSTALL_STATE_MODIFIER_LOCK } from './StringConstants';


export class LinuxGlobalInstaller extends IGlobalInstaller
{
    private version: string;
    private linuxSDKResolver: LinuxVersionResolver;
    private mode: DotnetInstallMode;

    constructor(acquisitionContext: IAcquisitionWorkerContext, utilContext: IUtilityContext, fullySpecifiedDotnetVersion: string, mode: DotnetInstallMode = 'sdk')
    {
        super(acquisitionContext, utilContext);
        this.linuxSDKResolver = new LinuxVersionResolver(acquisitionContext, utilContext);
        this.version = fullySpecifiedDotnetVersion;
        this.mode = mode;
    }

    public async installSDK(): Promise<string>
    {
        return this.installGlobal();
    }

    public override async installGlobal(): Promise<string>
    {
        await this.linuxSDKResolver.Initialize();

        return executeWithLock(this.acquisitionContext.eventStream, false, GLOBAL_INSTALL_STATE_MODIFIER_LOCK(this.acquisitionContext.installDirectoryProvider,
            GetDotnetInstallInfo(this.version, this.mode, 'global', os.arch())), GLOBAL_LOCK_PING_DURATION_MS, this.acquisitionContext.timeoutSeconds * 1000,
            async () =>
            {
                return this.linuxSDKResolver.ValidateAndInstall(this.version, this.mode);
            },);
    }

    public async uninstallSDK(): Promise<string>
    {
        return this.uninstallGlobal();
    }

    public override async uninstallGlobal(): Promise<string>
    {
        await this.linuxSDKResolver.Initialize();
        return this.linuxSDKResolver.Uninstall(this.version, this.mode);
    }

    public async getExpectedGlobalSDKPath(specificSDKVersionInstalled: string, installedArch: string, macPathShouldExist = true): Promise<string>
    {
        return this.getExpectedGlobalDotnetPath(specificSDKVersionInstalled, installedArch, macPathShouldExist);
    }

    public override async getExpectedGlobalDotnetPath(specificVersionInstalled: string, installedArch: string, macPathShouldExist = true): Promise<string>
    {
        await this.linuxSDKResolver.Initialize();

        const dotnetFolder = await (await this.linuxSDKResolver.distroCall()).getDotnetVersionSupportStatus(specificVersionInstalled, this.mode) === DotnetDistroSupportStatus.Distro ?
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
