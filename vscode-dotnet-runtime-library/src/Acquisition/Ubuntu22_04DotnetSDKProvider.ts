/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as proc from 'child_process';
import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';

export class Ubuntu22_04DotnetSDKProvider extends IDistroDotnetSDKProvider {

    public async installDotnet(installContext: IDotnetInstallationContext): Promise<boolean>
    {
        return false;
    }

    public async getInstalledGlobalDotnetPathIfExists() : Promise<string | null>
    {
        const commandResult = proc.spawnSync('which', ['dotnet']);
        return commandResult.toString();
    }

    public async getExpectedDotnetInstallationDirectory() : Promise<string>
    {
        return '';
    }

    public async dotnetPackageExistsOnSystem() : Promise<boolean>
    {
        return false;
    }

    public async isDotnetVersionSupported() : Promise<boolean>
    {
        return false;
    }

    public async upgradeDotnet(versionToUpgrade : string): Promise<boolean>
    {
        return false;
    }

    public async uninstallDotnet(versionToUninstall : string): Promise<boolean>
    {
        return false;
    }
}
