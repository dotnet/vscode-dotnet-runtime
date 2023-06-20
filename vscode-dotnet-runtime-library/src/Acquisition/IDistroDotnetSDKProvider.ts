/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as proc from 'child_process';
import * as fs from 'fs';
import { DistroVersionPair, DotnetDistroSupportStatus } from './DotnetGlobalSDKLinuxInstallerResolver';
import path = require('path');
import { DotnetAcquisitionDistroUnknownError, DotnetWSLSecurityError } from '../EventStream/EventStreamEvents';
import { VersionResolver } from './VersionResolver';
import { stderr } from 'process';
import {exec} from '@vscode/sudo-prompt';
import { FileUtilities } from '../Utils/FileUtilities';

/**
 * This interface describes the functionality needed to manage the .NET SDK on a specific distro and version of Linux.
 *
 * @remarks We accept community contributions of this interface for each distro-version pair.
 * All calls which require sudo must leverage the vscode/sudo library. We will not accept contributions that use other methods to gain admin privellege.
 * Please see DotnetDistroVersion as well to add your version.
 */
export abstract class IDistroDotnetSDKProvider {

    protected distroVersion : DistroVersionPair;
    protected distroJson : any | null = null;

    protected preinstallCommandKey : string = 'preInstallCommands';
    protected installCommandKey : string = 'installCommand';
    protected uninstallCommandKey : string = 'uninstallCommand';
    protected updateCommandKey : string = 'updateCommand';
    protected packageLookupCommandKey : string = 'packageLookupCommand';
    protected currentInstallPathCommandKey : string = 'currentInstallPathCommand';
    protected isInstalledCommandKey : string = 'isInstalledCommand';
    protected expectedMicrosoftFeedInstallDirKey : string = 'expectedDistroFeedInstallDirectory';
    protected expectedDistroFeedInstallDirKey : string = 'expectedMicrosoftFeedInstallDirectory';
    protected installedSDKVersionsCommandKey : string = 'installedSDKVersionsCommand';
    protected currentInstallInfoCommandKey : string = 'currentInstallationInfoCommand';

    protected distroVersionsKey : string = 'versions';
    protected versionKey : string = 'version';
    protected dotnetPackagesKey : string = 'dotnet';
    protected sdkKey : string = 'sdk';
    protected runtimeKey : string = 'runtime';
    protected aspNetKey : string = 'aspnetcore';

    constructor(distroVersion : DistroVersionPair) {
        this.distroVersion = distroVersion;
        // Hard-code to the upper path (lib/dist/acquisition) from __dirname to the lib folder, as webpack-copy doesn't seem to copy the distro-support.json
        const distroDataFile = path.join(path.dirname(path.dirname(__dirname)), 'distro-data', 'distro-support.json');
        this.distroJson = JSON.parse(fs.readFileSync(distroDataFile, 'utf8'));

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
    public abstract installDotnet(fullySpecifiedVersion : string): Promise<string>;

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
     * @remarks Returns the newest in support version of the dotnet SDK that's available in this distro+version.
     * Generally should be of the form major.minor.band with no patch, so like 7.0.1xx.
     */
    public abstract getRecommendedDotnetVersion() : string;

    /**
     *
     * @param fullySpecifiedVersion The version of dotnet to check support for in the 3-part semver version.
     * @returns true if the version is supported by default within the distro, false elsewise.
     */
    public async isDotnetVersionSupported(fullySpecifiedVersion : string) : Promise<boolean>
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
    public abstract upgradeDotnet(versionToUpgrade : string) : Promise<string>;

    /**
     * Uninstall the .NET SDK.
     * @param versionToUninstall The fully specified version of the .NET SDK to uninstall.
     * Return '0' on success.
     */
    public abstract uninstallDotnet(versionToUninstall : string) : Promise<string>;

    /**
     *
     * @param fullySpecifiedDotnetVersion The fully specified version requested.
     * @returns The most specific supported version by the distro that it uses in the package names.
     * Example: dotnet-sdk-7.0 is the package for ubuntu. For 7.0.103, the most specific we can give that will be in the json file is just 7.0.
     * Typically, the major.minor is what's given here.
     */
    protected abstract JsonDotnetVersion(fullySpecifiedDotnetVersion : string) : string;

    /**
     *
     * @param commandFollowUps The strings/args/options after the first word in the command.
     * @returns The output of the command.
     */
    private async ExecSudoAsync(commandFollowUps : string[]) : Promise<string>
    {
        if(this.isRunningUnderWSL())
        {
            // For WSL, vscode/sudo-prompt does not work.
            // This is because it relies on pkexec or a GUI app to popup and request sudo privellege.
            // GUI in WSL is not supported, so it will fail.
            // We can open a vscode box and get the user password, but that will require more security analysis.

            if(!FileUtilities.isElevated())
            {
                const err = new DotnetWSLSecurityError(new Error(`Automatic SDK Acqusition is not yet supported in WSL due to security concerns.`));
                throw err;
            }
            else
            {
                // TODO : verify this works
                // We are already elevated, so hopefully we don't need to get elevation and can just run the command.
                return (await this.runCommand(("sudo" + commandFollowUps.join(" ")), true))[0];
            }
        }

        // We wrap the exec in a promise because there is no synchronous version of the sudo exec command for vscode/sudo
        return new Promise<string>((resolve, reject) =>
        {
            // The '.' character is not allowed for sudo-prompt so we use 'DotNET'
            const options = { name: 'VS Code DotNET Acquisition' };
            exec(commandFollowUps.join(' '), options, (error?: any, stdout?: any, stderr?: any) =>
            {
                let commandResultString : string = '';

                if (stdout)
                {
                    commandResultString += stdout;
                }
                if (stderr)
                {
                    commandResultString += stderr;
                }

                if (error)
                {
                    reject(error);
                }
                else
                {
                    resolve(commandResultString);
                }
            });
        });
    }

    /**
     * Returns true if the linux agent is running under WSL, false elsewise.
     */
    private isRunningUnderWSL() : boolean
    {
        // See https://github.com/microsoft/WSL/issues/4071 for evidence that we can rely on this behavior.

        const command = 'grep';
        const args = ['-i', 'Microsoft', '/proc/version'];
        const commandResult = proc.spawnSync(command, args);

        return commandResult.stdout.toString() != '';
    }

    /**
     *
     * @param command The command to run as a whole string. Commands with && will be run individually. Sudo commands will request sudo from the user.
     * @returns the result(s) of each command. Can throw generically if the command fails.
     */
    protected async runCommand(command : string, forceNoSudoPrompt = false) : Promise<string[]>
    {

        const commands : string[] = command.split('&&');
        const commandResults : string[] = [];

        for (const command of commands)
        {
            const rootCommand = command.split(' ')[0];
            const commandFollowUps : string[] = command.split(' ').slice(1);

            if(rootCommand === "sudo" && !forceNoSudoPrompt)
            {
                const commandResult = await this.ExecSudoAsync(commandFollowUps);
                commandResults.push(commandResult);
            }
            else
            {
                const commandResult = proc.spawnSync(rootCommand, commandFollowUps);
                commandResults.push(commandResult.stdout.toString() + commandResult.stderr.toString());
            }
        }

        return commandResults;
    }

    protected myVersionPackages() : any
    {
        const distroVersions = this.distroJson[this.distroVersion.distro][this.distroVersionsKey];
        return distroVersions.filter((x: { [x: string]: string; }) => x[this.versionKey] === this.distroVersion.version)[0];
    }

    protected myDistroCommands() : any
    {
        return this.distroJson[this.distroVersion.distro];
    }

    protected myDotnetVersionPackages(fullySpecifiedDotnetVersion : string) : any
    {
        const myDotnetVersions = this.myVersionPackages();
        return myDotnetVersions[this.dotnetPackagesKey].filter((x: { [x: string]: string; }) => x[this.versionKey] == this.JsonDotnetVersion(fullySpecifiedDotnetVersion))[0];
    }
}
