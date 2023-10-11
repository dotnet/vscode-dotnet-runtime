/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { diff } from 'semver';
import { GenericDistroSDKProvider } from './GenericDistroSDKProvider';
import { DotnetDistroSupportStatus } from './LinuxVersionResolver';
import * as path from 'path';
import { version } from 'os';
/* tslint:disable:no-any */

export class RedHatDistroSDKProvider extends GenericDistroSDKProvider {
    /**
     * 
     * @param distroVersions - The available versions for .NET for given distribution
     * @param versionTarget - The version targeted for .NET
     * @param versionKey - The key to the version
     * @returns The closest version available between the available versions of the distribution and the target SDK version
     */
    private getClosestDistroVersion(distroVersions: any, versionTarget: number, versionKey: string)
    {
        if(distroVersions.length === 0){
            return null;
        }

        let closestDistroVersion = distroVersions[0];
        let closestDifference = Math.abs(versionTarget - closestDistroVersion[this.versionKey]);

        for(const num of distroVersions){
            const difference = Math.abs(versionTarget - num[this.versionKey]);
            if(difference < closestDifference){
                closestDistroVersion = num;
                closestDifference = difference;
            }
        }
        return closestDistroVersion;
    }

    protected myVersionPackages() : any
    {
        const distroVersions = this.distroJson[this.distroVersion.distro][this.distroVersionsKey];
        return this.getClosestDistroVersion(distroVersions, parseFloat(this.distroVersion.version), this.versionKey);
    }

    public async getInstalledGlobalDotnetPathIfExists() : Promise<string | null>
    {
        const commandResult = await this.commandRunner.execute(this.myDistroCommands()[this.currentInstallPathCommandKey]);
        if(commandResult[0].includes('no dotnet')){
            return '';
        }
        return commandResult[0];
    }
}
