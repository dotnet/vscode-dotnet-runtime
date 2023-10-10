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
    private getCloestDistroVersion(distroVersions: any, versionTarget: number, versionKey: string)
    {
        if(distroVersions.length === 0){
            return null;
        }

        let cloestDistroVersion = distroVersions[0];
        let cloestDifference = Math.abs(versionTarget - cloestDistroVersion[this.versionKey]);

        for(const num of distroVersions){
            const difference = Math.abs(versionTarget - num[this.versionKey]);
            if(difference < cloestDifference){
                cloestDistroVersion = num;
                cloestDifference = difference;
            }
        }
        return cloestDistroVersion;
    }

    protected myVersionPackages() : any
    {
        const distroVersions = this.distroJson[this.distroVersion.distro][this.distroVersionsKey];
        return this.getCloestDistroVersion(distroVersions, parseFloat(this.distroVersion.version), this.versionKey);
    }

    public async getInstalledGlobalDotnetPathIfExists() : Promise<string | null>
    {
        const commandResult = await this.commandRunner.execute(this.myDistroCommands()[this.currentInstallPathCommandKey]);
        if(commandResult[0].includes('no dotnet')){
            return '';
        }
        return commandResult[0];
    }

    public async getInstalledDotnetSDKVersions(): Promise<string[]>
    {
        const command = this.myDistroCommands()[this.installedSDKVersionsCommandKey];
        const commandResult = await this.commandRunner.execute(command);

        const outputLines : string[] = commandResult[0].split('\n');
        const versions : string[]  = [];

        for(const line of outputLines)
        {
            const splitLine = line.split(/\s+/);
            // list sdk lines shows in the form: version [path], so the version is the 2nd item
            if(splitLine.length === 2 && splitLine[0].length > 0)
            {
                versions.push(splitLine[0]);
            }
        }
        return versions;
    }
}
