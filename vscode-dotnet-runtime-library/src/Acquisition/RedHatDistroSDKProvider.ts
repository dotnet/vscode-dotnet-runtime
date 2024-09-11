/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { GenericDistroSDKProvider } from './GenericDistroSDKProvider';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { DistroVersionPair } from './LinuxVersionResolver';

export class RedHatDistroSDKProvider extends GenericDistroSDKProvider
{
    constructor(distroVersion : DistroVersionPair, context : IAcquisitionWorkerContext, utilContext : IUtilityContext, executor : ICommandExecutor | null = null)
    {
        super(distroVersion, context, utilContext, executor);
    }

    protected myVersionDetails() : any
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const distroVersions = this.distroJson[this.distroVersion.distro][this.distroVersionsKey];
        const targetVersion = Math.floor(parseFloat(this.distroVersion.version[0])).toFixed(1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const versionData = distroVersions.filter((x: { [x: string]: string; }) => x[this.versionKey] === String(targetVersion));
        return versionData;
    }
}