/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import path = require('path');
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';

export abstract class IGlobalInstaller {

    protected acquisitionContext : IAcquisitionWorkerContext;

    constructor(acquisitionContext : IAcquisitionWorkerContext) {
        this.acquisitionContext = acquisitionContext;
    }

    public abstract installSDK() : Promise<string>

    public abstract getExpectedGlobalSDKPath(specificSDKVersionInstalled : string, installedArch : string) : Promise<string>

    public abstract getGlobalSdkVersionsInstalledOnMachine() : Promise<Array<string>>;

    /**
     *
     * @returns The folder where global sdk installers will be downloaded onto the disk.
     */
    public static getDownloadedInstallFilesFolder() : string
    {
        return path.join(__dirname, 'installers');
    }
}
