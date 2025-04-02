/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { DotnetInstallMode } from './DotnetInstallMode';
import { GenericDistroSDKProvider } from './GenericDistroSDKProvider';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { DistroVersionPair } from './LinuxVersionResolver';

export class DebianDistroSDKProvider extends GenericDistroSDKProvider
{
    constructor(distroVersion: DistroVersionPair, context: IAcquisitionWorkerContext, utilContext: IUtilityContext, executor: ICommandExecutor | null = null)
    {
        super(distroVersion, context, utilContext, executor);
    }
    public override async dotnetPackageExistsOnSystem(fullySpecifiedDotnetVersion: string, installType: DotnetInstallMode): Promise<boolean>
    {
        await this.injectPMCFeed(fullySpecifiedDotnetVersion, installType);
        return super.dotnetPackageExistsOnSystem(fullySpecifiedDotnetVersion, installType);
    }
}