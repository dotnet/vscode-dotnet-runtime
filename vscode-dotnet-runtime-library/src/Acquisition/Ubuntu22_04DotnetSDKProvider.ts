/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as proc from 'child_process';
import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';

export class Ubuntu22_04DotnetSDKProvider extends IDistroDotnetSDKProvider {

    public installDotnet(installContext: IDotnetInstallationContext): Promise<void>
    {

    }

    public async getInstalledDotnetPathIfExists() : Promise<string | null>
    {
        const commandResult = proc.spawnSync('which', ['dotnet']);
        return commandResult.toString();
    }

    public async getExpectedDotnetInstallationDirectory() : Promise<string>
    {

    }

    public async dotnetPackageExistsOnSystem() : Promise<boolean>
    {

    }

    public async isDotnetVersionSupported() : Promise<boolean>
    {

    }

    public async upgradeDotnet(versionToUpgrade : string): Promise<boolean>
    {

    }

    public async uninstallDotnet(versionToUninstall : string): Promise<boolean>
    {

    }
}
