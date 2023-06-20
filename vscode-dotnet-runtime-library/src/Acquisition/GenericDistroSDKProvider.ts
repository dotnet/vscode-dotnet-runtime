/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { DotnetDistroSupportStatus } from './DotnetGlobalSDKLinuxInstallerResolver';
import { VersionResolver } from './VersionResolver';

export class GenericDistroSDKProvider extends IDistroDotnetSDKProvider {

    public async installDotnet(fullySpecifiedVersion : string): Promise<string>
    {
        const supportStatus = await this.getDotnetVersionSupportStatus(fullySpecifiedVersion);
        if(supportStatus == DotnetDistroSupportStatus.Microsoft)
        {
            const preinstallCommands = this.myVersionPackages()[this.preinstallCommandKey];
            const preparationResult = (await this.runCommand(preinstallCommands))[0];
        }

        let command = this.myDistroCommands()[this.installCommandKey];
        const sdkPackage = this.myDotnetVersionPackages(fullySpecifiedVersion)[this.sdkKey];
        command = command.replace("{0}", sdkPackage);
        const commandResult = await this.runCommand(command);

        return commandResult[0];
    }

    public async getInstalledGlobalDotnetPathIfExists() : Promise<string | null>
    {
        const commandResult = await this.runCommand(this.myDistroCommands()[this.currentInstallPathCommandKey]);
        return commandResult[0];
    }

    public async dotnetPackageExistsOnSystem(fullySpecifiedDotnetVersion : string) : Promise<boolean>
    {
        let command = this.myDistroCommands()[this.packageLookupCommandKey];
        const sdkPackage = this.myDotnetVersionPackages(this.JsonDotnetVersion(fullySpecifiedDotnetVersion))[this.sdkKey];
        command = command.replace("{0}", sdkPackage);
        const commandResult = await this.runCommand(command);

        const noPackageResult = 'no packages found';
        // TODO: check this v
        return commandResult[0].includes(noPackageResult);
    }

    public getExpectedDotnetDistroFeedInstallationDirectory(): Promise<string>
    {
        return this.myDistroCommands()[this.expectedDistroFeedInstallDirKey];
    }

    public getExpectedDotnetMicrosoftFeedInstallationDirectory(): Promise<string>
    {
        return this.myDistroCommands()[this.expectedMicrosoftFeedInstallDirKey];
    }

    public async upgradeDotnet(versionToUpgrade : string): Promise<string>
    {
        let command = this.myDistroCommands()[this.updateCommandKey];
        const sdkPackage = this.myDotnetVersionPackages(versionToUpgrade)[this.sdkKey];
        command = command.replace("{0}", sdkPackage);
        const commandResult = await this.runCommand(command);

        return commandResult[0];
    }

    public async uninstallDotnet(versionToUninstall : string): Promise<string>
    {
        let command = this.myDistroCommands()[this.uninstallCommandKey];
        const sdkPackage = this.myDotnetVersionPackages(versionToUninstall)[this.sdkKey];
        command = command.replace("{0}", sdkPackage);
        const commandResult = await this.runCommand(command);

        return commandResult[0];
    }

    public async getInstalledDotnetVersions(): Promise<string[]>
    {
        const command = this.myDistroCommands()[this.installedSDKVersionsCommandKey];
        const commandResult = await this.runCommand(command);

        // TODO: Verify this works v
        const versions : string[] = commandResult[0].split("\n");
        return versions;
    }

    public async getInstalledGlobalDotnetVersionIfExists(): Promise<string | null>
    {
        const command = this.myDistroCommands()[this.currentInstallInfoCommandKey];
        const commandResult = (await this.runCommand(command))[0];

        // TODO: Check for the line .NET SDK and then the line Version' after that. The version should be after a tab
        return null;
    }

    public getDotnetVersionSupportStatus(fullySpecifiedVersion: string): Promise<DotnetDistroSupportStatus>
    {
        if(VersionResolver.getFeatureBandFromVersion(fullySpecifiedVersion) != '1')
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
        return this.JsonDotnetVersion(maxVersion) + '.1xx';
    }

    protected JsonDotnetVersion(fullySpecifiedDotnetVersion : string) : string
    {
        return VersionResolver.getMajorMinor(fullySpecifiedDotnetVersion);
    }
}
