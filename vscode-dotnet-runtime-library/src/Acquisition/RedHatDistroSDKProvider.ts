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

    public async installDotnet(fullySpecifiedVersion : string): Promise<string>
    {
        const supportStatus = await this.getDotnetVersionSupportStatus(fullySpecifiedVersion);
        if(supportStatus === DotnetDistroSupportStatus.Microsoft)
        {
            const preinstallCommands = this.myVersionPackages()[this.preinstallCommandKey];
            const preparationResult = (await this.commandRunner.execute(preinstallCommands))[0];
        }

        let command = this.myDistroCommands()[this.installCommandKey];
        const sdkPackage = this.myDotnetVersionPackages(fullySpecifiedVersion)[this.sdkKey];
        command = command.replace('{0}', sdkPackage);
        const commandResult = await this.commandRunner.execute(command);

        return commandResult[0];
    }

    public async getInstalledGlobalDotnetPathIfExists() : Promise<string | null>
    {
        const commandResult = await this.commandRunner.execute(this.myDistroCommands()[this.currentInstallPathCommandKey]);
        if(commandResult[0].includes('no dotnet')){
            return '';
        }
        return commandResult[0];
    }

    public async dotnetPackageExistsOnSystem(fullySpecifiedDotnetVersion : string) : Promise<boolean>
    {
        let command = this.myDistroCommands()[this.packageLookupCommandKey];
        const sdkPackage = this.myDotnetVersionPackages(this.JsonDotnetVersion(fullySpecifiedDotnetVersion))[this.sdkKey];
        command = command.replace('{0}', sdkPackage);
        const commandResult = await this.commandRunner.execute(command);

        const noPackageResult = 'no packages found';
        return commandResult[0].includes(noPackageResult);
    }

    public getExpectedDotnetDistroFeedInstallationDirectory(): Promise<string>
    {
        return this.myDistroCommands()[this.expectedDistroFeedInstallDirKey];
    }

    public getExpectedDotnetMicrosoftFeedInstallationDirectory(): Promise<string>
    {
        return Promise.resolve('');
    }

    public async upgradeDotnet(versionToUpgrade : string): Promise<string>
    {
        let command = this.myDistroCommands()[this.updateCommandKey];
        const sdkPackage = this.myDotnetVersionPackages(versionToUpgrade)[this.sdkKey];
        command = command.replace('{0}', sdkPackage);
        const commandResult = await this.commandRunner.execute(command);

        return commandResult[0];
    }

    public async uninstallDotnet(versionToUninstall : string): Promise<string>
    {
        let command = this.myDistroCommands()[this.uninstallCommandKey];
        const sdkPackage = this.myDotnetVersionPackages(versionToUninstall)[this.sdkKey];
        command = command.replace('{0}', sdkPackage);
        const commandResult = await this.commandRunner.execute(command);

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
            if(splitLine.length === 2)
            {
                versions.push(splitLine[0]);
            }
        }
        return versions;
    }

    public async getInstalledDotnetRuntimeVersions(): Promise<string[]>
    {
        const command = this.myDistroCommands()[this.installedRuntimeVersionsCommandKey];
        const commandResult = await this.commandRunner.execute(command);

        const outputLines : string[] = commandResult[0].split('\n');
        const versions : string[]  = [];

        for(const line of outputLines)
        {
            const splitLine = line.split(/\s+/);
            // list runtimes lines shows in the form: runtime version [path], so the version is the 3rd item
            if(splitLine.length === 3)
            {
                versions.push(splitLine[1]);
            }
        }
        return versions;
    }

    public async getInstalledGlobalDotnetVersionIfExists(): Promise<string | null>
    {
        const command = this.myDistroCommands()[this.currentInstallVersionCommandKey];

        // we need to run this command in the root directory otherwise local dotnets on the path may interfere
        const rootDir = path.parse(__dirname).root;
        let commandResult = (await this.commandRunner.execute(command, rootDir))[0];

        commandResult = commandResult.replace('\n', '');
        if(!this.versionResolver.isValidLongFormVersionFormat(commandResult))
        {
            return null;
        }
        {
            return commandResult;
        }
    }

    public getDotnetVersionSupportStatus(fullySpecifiedVersion: string): Promise<DotnetDistroSupportStatus>
    {
        if(this.versionResolver.getFeatureBandFromVersion(fullySpecifiedVersion) !== '1')
        {
            return Promise.resolve(DotnetDistroSupportStatus.Unsupported);
        }

        const simplifiedVersion = this.JsonDotnetVersion(fullySpecifiedVersion);
        const versionData = this.myVersionPackages();
        if(versionData.hasOwnProperty(this.preinstallCommandKey))
        {
            // If preinstall commmands exist ( to add the msft feed ) then it's a microsoft feed.
            return Promise.resolve(DotnetDistroSupportStatus.Microsoft);
        }
        else
        {
            const json = versionData[this.dotnetPackagesKey];
            for(const dotnetPackages of json)
            {
                if(Number(dotnetPackages[this.versionKey]) === Number(simplifiedVersion))
                {
                    return Promise.resolve(DotnetDistroSupportStatus.Distro);
                }
            }
        }

        return Promise.resolve(DotnetDistroSupportStatus.Unknown);
    }

    public getRecommendedDotnetVersion() : string
    {
        let maxVersion = '0';
        const json = this.myVersionPackages()[this.dotnetPackagesKey];
        for(const dotnetPackages of json)
        {
            if(Number(dotnetPackages[this.versionKey]) > Number(maxVersion))
            {
                maxVersion = dotnetPackages[this.versionKey];
            }
        }

        // Most distros support only 100 band .NET versions, so we default to that here.
        return `${this.JsonDotnetVersion(maxVersion)}.1xx`;
    }

    public JsonDotnetVersion(fullySpecifiedDotnetVersion : string) : string
    {
        return this.versionResolver.getMajorMinor(fullySpecifiedDotnetVersion);
    }
}
