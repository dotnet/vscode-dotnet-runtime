/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import path = require("path");
import { IAcquisitionWorkerContext } from "./IAcquisitionWorkerContext";

export abstract class ISDKInstaller {

    protected context : IAcquisitionWorkerContext;

    constructor(context : IAcquisitionWorkerContext)
    {
        this.context = context;
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
