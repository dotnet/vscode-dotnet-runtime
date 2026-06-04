/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { DistroVersionPair } from './LinuxVersionResolver';
import { RedHatDistroSDKProvider } from './RedHatDistroSDKProvider';

/**
 * Rocky Linux is binary-compatible with Red Hat Enterprise Linux, uses the same dnf package manager,
 * and ships .NET SDK packages in its AppStream repository. Version parsing mirrors RHEL behaviour:
 * the major version component (e.g. "8" from "8.10") is used to look up the matching entry in
 * distro-support.json.
 */
export class RockyLinuxDistroSDKProvider extends RedHatDistroSDKProvider
{
    constructor(distroVersion : DistroVersionPair, context : IAcquisitionWorkerContext, utilContext : IUtilityContext, executor : ICommandExecutor | null = null)
    {
        super(distroVersion, context, utilContext, executor);
    }
}
