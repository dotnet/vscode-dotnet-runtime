/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as proc from 'child_process';
import * as fs from 'fs';
import { DistroVersionPair, DotnetDistroSupportStatus } from './DotnetGlobalSDKLinuxInstallerResolver';
import path = require('path');
import { DotnetAcquisitionDistroUnknownError } from '../EventStream/EventStreamEvents';
import { VersionResolver } from './VersionResolver';

/**
 * This interface describes the functionality needed to manage the .NET SDK on a specific distro and version of Linux.
 *
 * @remarks We accept community contributions of this interface for each distro-version pair.
 * All calls which require sudo must leverage the vscode/sudo library. We will not accept contributions that use other methods to gain admin privellege.
 * Please see DotnetDistroVersion as well to add your version.
 */
export abstract class IDistroDotnetSDKProvider {

    private distroVersion : DistroVersionPair | null = null;
    private distroJson : JSON | null = null;

    constructor(distroVersion : DistroVersionPair) {
        this.distroVersion = distroVersion;
        this.distroJson = JSON.parse(fs.readFileSync(path.join('distroInstallInformation', 'distroInstalls.json'), 'utf8'));

        if(!distroVersion || !this.distroJson || !((this.distroJson as any)[this.distroVersion.distro]))
        {
            const error = new DotnetAcquisitionDistroUnknownError(new Error('We are unable to detect the distro or version of your machine'));
            throw error;
        }
    }

    /**
     * Run the needed command(s) to install the .NET SDK on the machine 'globally.'
     * Return '0' on success.
     * @param installContext
     */
    public abstract installDotnet(): Promise<string>;

    /**
     * Search the machine for all installed .NET SDKs and return a list of their fully specified versions.
     * The fully specified version is a 3-part semver, such as 7.0.103
     */
    public abstract getInstalledDotnetVersions() : Promise<Array<string>>;

    /**
     * For the .NET SDK that should be on the path and or managed by the distro, return its path.
     * Return null if no installations can be found. Do NOT include the version of dotnet in this path.
     */
    public abstract getInstalledGlobalDotnetPathIfExists() : Promise<string | null>;

    /**
     * For the .NET SDK that should be on the path and or managed by the distro, return its fully specified version.
     * Return null if no installations can be found.
     */
    public abstract getInstalledGlobalDotnetVersionIfExists() : Promise<string | null>;

    /**
     * Return the directory where the dotnet SDK should be installed per the distro preferences.
     * (e.g. where the distro would install it given its supported by default if you ran apt-get install.)
     */
    public abstract getExpectedDotnetDistroFeedInstallationDirectory() : Promise<string>;

    /**
     * Return the directory where the dotnet SDK should be installed if installed using the microsoft feeds.
     */
    public abstract getExpectedDotnetMicrosoftFeedInstallationDirectory() : Promise<string>;

    /**
     * Return true if theres a package for the dotnet version on the system with the same major as the requested fullySpecifiedVersion, false elsewise.
     */
    public abstract dotnetPackageExistsOnSystem(fullySpecifiedVersion : string) : Promise<boolean>;

    /**
     * Return the support status for this distro and version. See DotnetDistroSupportStatus for more info.
     */
    public abstract getDotnetVersionSupportStatus(fullySpecifiedVersion : string) : Promise<DotnetDistroSupportStatus>;

    /**
     *
     * @param fullySpecifiedVersion The version of dotnet to check support for in the 3-part semver version.
     * @returns true if the version is supported by default within the distro, false elsewise.
     */
    public async isDotnetVersionSupported(fullySpecifiedVersion : string)
    {
        const supportStatus = await this.getDotnetVersionSupportStatus(fullySpecifiedVersion);
        const supportedType : boolean = supportStatus === DotnetDistroSupportStatus.Distro || supportStatus === DotnetDistroSupportStatus.Microsoft;
        return supportedType && VersionResolver.getFeatureBandFromVersion(fullySpecifiedVersion) === '1';
    }

    /**
     * Update the globally installed .NET to the newest in-support version of the same feature band and major.minor.
     * Return '0' on success.
     * @param versionToUpgrade The version of dotnet to upgrade.
     */
    public abstract upgradeDotnet(versionToUpgrade : string): Promise<string>;

    /**
     * Uninstall the .NET SDK.
     * @param versionToUninstall The fully specified version of the .NET SDK to uninstall.
     * Return '0' on success.
     */
    public abstract uninstallDotnet(versionToUninstall : string): Promise<string>;

    /**
     * 
     * @param command The command to run as a whole string. Commands with && will be run individually. Sudo commands will request sudo from the user.
     * @returns the result(s) of each command. Can throw generically if the command fails.
     */
    protected async runCommand(command : string) : Promise<string[]>
    {
        const sudoPrompt = await import('@vscode/sudo-prompt');

        const commands : string[] = command.split('&&');
        const commandResults : string[] = [];

        for (const command of commands)
        {
            const rootCommand = command.split(' ')[0];
            const commandFollowUps = command.split(' ').slice(1);

            if(rootCommand === "sudo")
            {
                const options = {name: 'VS Code .NET Acquisition'};
                sudoPrompt.exec(command.slice(1), options, (error?: any, stdout?: any, stderr?: any) =>
                {
                    if (error)
                    {
                        throw error;
                    }
                });
            }
            else
            {
                const commandResult = proc.spawnSync(rootCommand, commandFollowUps);
            }
        }

        // TODO : append results.
        return commandResults;
    }
}
