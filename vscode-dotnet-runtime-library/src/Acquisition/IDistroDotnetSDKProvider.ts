/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import { DistroVersionPair, DotnetDistroSupportStatus } from './LinuxVersionResolver';
import path = require('path');
import { DotnetAcquisitionDistroUnknownError } from '../EventStream/EventStreamEvents';
import { VersionResolver } from './VersionResolver';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
/* tslint:disable:no-any */

/**
 * This interface describes the functionality needed to manage the .NET SDK on a specific distro and version of Linux.
 *
 * @remarks We accept community contributions of this interface for each distro-version pair.
 * All calls which require sudo must leverage the vscode/sudo library. We will not accept contributions that use other methods to gain admin privellege.
 * Please see DotnetDistroVersion as well to add your version.
 */
export abstract class IDistroDotnetSDKProvider {

    protected commandRunner : ICommandExecutor;
    protected distroVersion : DistroVersionPair;
    protected versionResolver : VersionResolver;
    protected distroJson : any | null = null;

    protected preinstallCommandKey = 'preInstallCommands';
    protected installCommandKey = 'installCommand';
    protected uninstallCommandKey = 'uninstallCommand';
    protected updateCommandKey = 'updateCommand';
    protected packageLookupCommandKey = 'packageLookupCommand';
    protected currentInstallPathCommandKey = 'currentInstallPathCommand';
    protected isInstalledCommandKey = 'isInstalledCommand';
    protected expectedMicrosoftFeedInstallDirKey = 'expectedMicrosoftFeedInstallDirectory';
    protected expectedDistroFeedInstallDirKey = 'expectedDistroFeedInstallDirectory';
    protected installedSDKVersionsCommandKey = 'installedSDKVersionsCommand';
    protected installedRuntimeVersionsCommandKey = 'installedRuntimeVersionsCommand';
    protected currentInstallVersionCommandKey = 'currentInstallationVersionCommand';

    protected distroVersionsKey = 'versions';
    protected versionKey = 'version';
    protected dotnetPackagesKey = 'dotnet';
    protected sdkKey = 'sdk';
    protected runtimeKey = 'runtime';
    protected aspNetKey = 'aspnetcore';

    constructor(distroVersion : DistroVersionPair, context : IAcquisitionWorkerContext, executor : ICommandExecutor | null = null)
    {
        this.commandRunner = executor ?? new CommandExecutor();
        this.distroVersion = distroVersion;
        this.versionResolver = new VersionResolver(context.extensionState, context.eventStream);
        // Hard-code to the upper path (lib/dist/acquisition) from __dirname to the lib folder, as webpack-copy doesn't seem to copy the distro-support.json
        const distroDataFile = path.join(path.dirname(path.dirname(__dirname)), 'distro-data', 'distro-support.json');
        this.distroJson = JSON.parse(fs.readFileSync(distroDataFile, 'utf8'));

        if(!distroVersion || !this.distroJson || !((this.distroJson as any)[this.distroVersion.distro]))
        {
            const error = new DotnetAcquisitionDistroUnknownError(new Error('We are unable to detect the distro or version of your machine'));
            throw error.error;
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
    public abstract getInstalledDotnetSDKVersions() : Promise<Array<string>>;

    /**
     * Search the machine for all installed .NET Runtimes and return a list of their fully specified versions.
     * The fully specified version is a 3-part semver, such as 7.0.103.
     * Note this also gives aspnet runtime versions, etc, not just core runtimes.
     */
    public abstract getInstalledDotnetRuntimeVersions() : Promise<Array<string>>;

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
     * @remarks Public for testing. Do NOT use.
     */
    public abstract JsonDotnetVersion(fullySpecifiedDotnetVersion : string) : string;

    /**
     *
     * @param fullySpecifiedVersion The version of dotnet to check support for in the 3-part semver version.
     * @returns true if the version is supported by default within the distro, false elsewise.
     */
    public async isDotnetVersionSupported(fullySpecifiedVersion : string) : Promise<boolean>
    {
        const supportStatus = await this.getDotnetVersionSupportStatus(fullySpecifiedVersion);
        const supportedType : boolean = supportStatus === DotnetDistroSupportStatus.Distro || supportStatus === DotnetDistroSupportStatus.Microsoft;
        return supportedType && this.versionResolver.getFeatureBandFromVersion(fullySpecifiedVersion) === '1';
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
        return myDotnetVersions[this.dotnetPackagesKey].filter((x: { [x: string]: string; }) => x[this.versionKey] === this.JsonDotnetVersion(fullySpecifiedDotnetVersion))[0];
    }
}
