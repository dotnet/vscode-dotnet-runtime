/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import path = require('path');
import crypto = require('crypto')
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { DotnetInstall } from './DotnetInstall';

export abstract class IGlobalInstaller {

    protected acquisitionContext : IAcquisitionWorkerContext;
    protected utilityContext : IUtilityContext;

    constructor(acquisitionContext : IAcquisitionWorkerContext, utilContext : IUtilityContext) {
        this.acquisitionContext = acquisitionContext;
        this.utilityContext = utilContext;
    }

    public abstract installSDK(install : DotnetInstall) : Promise<string>

    public abstract uninstallSDK(install : DotnetInstall) : Promise<string>

    public abstract getExpectedGlobalSDKPath(specificSDKVersionInstalled : string, installedArch : string, macPathShouldExist? : boolean) : Promise<string>

    /**
     *
     * @returns The folder where global sdk installers will be downloaded onto the disk.
     */
    public static getDownloadedInstallFilesFolder(uniqueInstallerId : string) : string
    {
        return path.join(__dirname, 'installers', crypto.createHash('sha256').update(uniqueInstallerId).digest('hex'));
    }
}
