/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { DotnetDistroSupportStatus } from './DotnetGlobalSDKLinuxInstallerResolver';

export class GenericDistroSDKProvider extends IDistroDotnetSDKProvider {

    public async installDotnet(): Promise<string>
    {
        return (await this.runCommand("sudo apt-get"))[0];
    }

    public async getInstalledGlobalDotnetPathIfExists() : Promise<string | null>
    {
        const commandResult = this.runCommand('which dotnet');
        return commandResult.toString();
    }

    public async dotnetPackageExistsOnSystem() : Promise<boolean>
    {
        throw new Error('Method not implemented.');
    }

    public async isDotnetVersionSupported() : Promise<boolean>
    {
        throw new Error('Method not implemented.');
    }

    public getExpectedDotnetDistroFeedInstallationDirectory(): Promise<string>
    {
        throw new Error('Method not implemented.');
    }

    public getExpectedDotnetMicrosoftFeedInstallationDirectory(): Promise<string>
    {
        throw new Error('Method not implemented.');
    }

    public async upgradeDotnet(versionToUpgrade : string): Promise<string>
    {
        throw new Error('Method not implemented.');
    }

    public async uninstallDotnet(versionToUninstall : string): Promise<string>
    {
        throw new Error('Method not implemented.');
    }

    public getInstalledDotnetVersions(): Promise<string[]>
    {
        throw new Error('Method not implemented.');
    }

    public getInstalledGlobalDotnetVersionIfExists(): Promise<string | null>
    {
        throw new Error('Method not implemented.');
    }

    public getDotnetVersionSupportStatus(fullySpecifiedVersion: string): Promise<DotnetDistroSupportStatus>
    {
        throw new Error('Method not implemented.');
    }
}
