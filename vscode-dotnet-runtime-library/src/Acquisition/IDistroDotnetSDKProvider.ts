/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as os from 'os';

import path = require('path');

import { DistroVersionPair, DotnetDistroSupportStatus } from './LinuxVersionResolver';
import { DotnetAcquisitionDistroUnknownError, DotnetVersionResolutionError } from '../EventStream/EventStreamEvents';
import { VersionResolver } from './VersionResolver';
import { CommandExecutorCommand } from '../Utils/CommandExecutorCommand';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { LinuxInstallType } from './LinuxInstallType';
import { LinuxPackageCollection } from './LinuxPackageCollection';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { getInstallKeyFromContext } from '../Utils/InstallKeyGenerator';
/* tslint:disable:no-any */

/**
 * This interface describes the functionality needed to manage the .NET SDK on a specific distro and version of Linux.
 *
 * @remarks We accept community contributions of this interface for each distro-version pair.
 * All calls which require sudo must leverage the vscode/sudo library. We will not accept contributions that use other methods to gain admin privilege.
 * Please see DotnetDistroVersion as well to add your version.
 */
export abstract class IDistroDotnetSDKProvider {

    protected commandRunner : ICommandExecutor;
    protected distroVersion : DistroVersionPair;
    protected versionResolver : VersionResolver;
    protected context : IAcquisitionWorkerContext;
    protected distroJson : any | null = null;

    protected preinstallCommandKey = 'preInstallCommands';
    protected installCommandKey = 'installCommand';
    protected uninstallCommandKey = 'uninstallCommand';
    protected searchCommandKey = 'searchCommand';
    protected updateCommandKey = 'updateCommand';
    protected packageLookupCommandKey = 'packageLookupCommand';
    protected readSymbolicLinkCommandKey = 'readSymLinkCommand';
    protected currentInstallPathCommandKey = 'currentInstallPathCommand';
    protected isInstalledCommandKey = 'isInstalledCommand';
    protected expectedMicrosoftFeedInstallDirKey = 'expectedMicrosoftFeedInstallDirectory';
    protected expectedDistroFeedInstallDirKey = 'expectedDistroFeedInstallDirectory';
    protected installedSDKVersionsCommandKey = 'installedSDKVersionsCommand';
    protected installedRuntimeVersionsCommandKey = 'installedRuntimeVersionsCommand';
    protected currentInstallVersionCommandKey = 'currentInstallationVersionCommand';
    protected missingPackageNameKey = '{packageName}';
    protected missingPathKey = '{path}';

    protected distroVersionsKey = 'versions';
    protected versionKey = 'version';
    protected dotnetPackagesKey = 'dotnet';
    protected distroPackagesKey = 'packages';
    protected sdkKey = 'sdk';
    protected runtimeKey = 'runtime';
    protected aspNetKey = 'aspnetcore';

    constructor(distroVersion : DistroVersionPair, context : IAcquisitionWorkerContext, utilContext : IUtilityContext, executor : ICommandExecutor | null = null)
    {
        this.commandRunner = executor ?? new CommandExecutor(context, utilContext);
        this.context = context;
        this.distroVersion = distroVersion;
        this.versionResolver = new VersionResolver(context);
        // Hard-code to the upper path (lib/dist/acquisition) from __dirname to the lib folder, as webpack-copy doesn't seem to copy the distro-support.json
        const distroDataFile = path.join(__dirname, 'distro-data', `distro-support.json`);
        this.distroJson = JSON.parse(fs.readFileSync(distroDataFile, 'utf8'));
        if(!distroVersion || !this.distroJson || !((this.distroJson as any)[this.distroVersion.distro]))
        {
            const error = new DotnetAcquisitionDistroUnknownError(new Error('We are unable to detect the distro or version of your machine'),
                getInstallKeyFromContext(this.context.acquisitionContext));
            throw error.error;
        }
    }

    /**
     * Run the needed command(s) to install the .NET SDK on the machine 'globally.'
     * Return '0' on success.
     * @param installContext
     */
    public abstract installDotnet(fullySpecifiedVersion : string, installType : LinuxInstallType): Promise<string>;

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
    public abstract getInstalledGlobalDotnetPathIfExists(installType : LinuxInstallType) : Promise<string | null>;

    /**
     * For the .NET SDK that should be on the path and or managed by the distro, return its fully specified version.
     * Return null if no installations can be found.
     */
    public abstract getInstalledGlobalDotnetVersionIfExists() : Promise<string | null>;

    /**
     * Return the directory where the dotnet SDK should be installed per the distro preferences.
     * (e.g. where the distro would install it given its supported by default if you ran apt-get install.)
     */
    public abstract getExpectedDotnetDistroFeedInstallationDirectory() : string;

    /**
     * Return the directory where the dotnet SDK should be installed if installed using the microsoft feeds.
     */
    public abstract getExpectedDotnetMicrosoftFeedInstallationDirectory() : string;

    /**
     * Return true if theres a package for the dotnet version on the system with the same major as the requested fullySpecifiedVersion, false else.
     */
    public abstract dotnetPackageExistsOnSystem(fullySpecifiedDotnetVersion : string, installType : LinuxInstallType) : Promise<boolean>;

    /**
     * Return the support status for this distro and version. See DotnetDistroSupportStatus for more info.
     */
    public abstract getDotnetVersionSupportStatus(fullySpecifiedVersion: string, installType : LinuxInstallType): Promise<DotnetDistroSupportStatus>;

    /**
     * @remarks Returns the newest in support version of the dotnet SDK that's available in this distro+version.
     * Generally should be of the form major.minor.band with no patch, so like 7.0.1xx.
     */
    public abstract getRecommendedDotnetVersion(installType : LinuxInstallType) : Promise<string>;

    /**
     * Update the globally installed .NET to the newest in-support version of the same feature band and major.minor.
     * Return '0' on success.
     * @param versionToUpgrade The version of dotnet to upgrade.
     */
    public abstract upgradeDotnet(versionToUpgrade : string, installType : LinuxInstallType): Promise<string>;

    /**
     * Uninstall the .NET SDK.
     * @param versionToUninstall The fully specified version of the .NET SDK to uninstall.
     * Return '0' on success.
     */
    public abstract uninstallDotnet(versionToUninstall : string, installType : LinuxInstallType): Promise<string>;

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
     * @returns true if the version is supported by default within the distro, false else.
     */
    public async isDotnetVersionSupported(fullySpecifiedVersion : string, installType : LinuxInstallType) : Promise<boolean>
    {
        const supportStatus = await this.getDotnetVersionSupportStatus(fullySpecifiedVersion, installType);
        const supportedType : boolean = supportStatus === DotnetDistroSupportStatus.Distro || supportStatus === DotnetDistroSupportStatus.Microsoft;
        return supportedType;
    }

    protected async myVersionPackages(installType : LinuxInstallType, haveTriedFeedInjectionAlready = false) : Promise<LinuxPackageCollection[]>
    {
        const availableVersions : LinuxPackageCollection[] = [];

        const potentialDotnetPackageNames = this.distroJson[this.distroVersion.distro][this.distroPackagesKey];
        for(const packageSet of potentialDotnetPackageNames)
        {
            const thisVersionPackage : LinuxPackageCollection =
            {
                version: packageSet[this.versionKey],
                packages : []
            }

            for(const packageName of packageSet[installType])
            {
                let command = this.myDistroCommands(this.searchCommandKey);
                command = CommandExecutor.replaceSubstringsInCommands(command, this.missingPackageNameKey, packageName);
                const packageIsAvailableResult = (await this.commandRunner.executeMultipleCommands(command))[0];
                const packageExists = this.isPackageFoundInSearch(packageIsAvailableResult);
                if(packageExists)
                {
                    thisVersionPackage.packages.push(packageName);
                }
            }

            if(thisVersionPackage.packages.length !== 0)
            {
                availableVersions.push(thisVersionPackage);
            }
        }

        if(availableVersions.length === 0 && !haveTriedFeedInjectionAlready)
        {
            // PMC is only injected and should only be injected for MSFT feed distros.
            // Our check runs by checking the feature band first, so that needs to be supported for it to fallback to the preinstall command check.
            const fakeVersionToCheckMicrosoftSupportStatus = '6.0.1xx';

            await this.injectPMCFeed(fakeVersionToCheckMicrosoftSupportStatus, installType);
            return this.myVersionPackages(installType, true);
        }
        return availableVersions;
    }

    protected async injectPMCFeed(fullySpecifiedVersion : string, installType : LinuxInstallType)
    {
        const supportStatus = await this.getDotnetVersionSupportStatus(fullySpecifiedVersion, installType);
        if(supportStatus === DotnetDistroSupportStatus.Microsoft)
        {
            const myVersionDetails = this.myVersionDetails();
            const preInstallCommands = myVersionDetails[this.preinstallCommandKey] as CommandExecutorCommand[];
            await this.commandRunner.executeMultipleCommands(preInstallCommands);
        }
    }

    protected myVersionDetails() : any
    {

        const distroVersions = this.distroJson[this.distroVersion.distro][this.distroVersionsKey];
        const versionData = distroVersions.filter((x: { [x: string]: string; }) => x[this.versionKey] === this.distroVersion.version)[0];
        if(!versionData)
        {
            const closestVersion = this.findMostSimilarVersion(this.distroVersion.version, distroVersions.map((x: { [x: string]: string; }) => parseFloat(x[this.versionKey])));
            return distroVersions.filter((x: { [x: string]: string; }) => parseFloat(x[this.versionKey]) === closestVersion)[0];
        }
        return versionData;
    }

    protected findMostSimilarVersion(myVersion : string, knownVersions : number[]) : number
    {
        const sameMajorVersions = knownVersions.filter(x => Math.floor(x) === Math.floor(parseFloat(myVersion)));
        if(sameMajorVersions && sameMajorVersions.length)
        {
            return Math.max(...sameMajorVersions);
        }

        const lowerMajorVersions = knownVersions.filter(x => x < Math.floor(parseFloat(myVersion)));
        if(lowerMajorVersions && lowerMajorVersions.length)
        {
            return Math.max(...lowerMajorVersions);
        }

        // Just return the lowest known version, as it will be the closest to our version, as they are all larger than our version.
        return Math.min(...knownVersions);
    }

    protected myDistroStrings(stringKey : string) : string
    {
        return this.distroJson[this.distroVersion.distro][stringKey];
    }

    protected myDistroCommands(commandKey : string) : CommandExecutorCommand[]
    {
        return this.distroJson[this.distroVersion.distro][commandKey] as CommandExecutorCommand[];
    }

    protected async myDotnetVersionPackageName(fullySpecifiedDotnetVersion : string, installType : LinuxInstallType) : Promise<string>
    {
        const myDotnetVersions = await this.myVersionPackages(installType);
        for(const dotnetPackage of myDotnetVersions)
        {
            if(dotnetPackage.version === this.JsonDotnetVersion(fullySpecifiedDotnetVersion))
            {
                // Arbitrarily pick the first existing package.
                return dotnetPackage.packages[0];
            }
        }
        const err = new Error(`Could not find a .NET package for version ${fullySpecifiedDotnetVersion}. Found only: ${JSON.stringify(await this.myVersionPackages(installType))}`);
        this.context.eventStream.post(new DotnetVersionResolutionError(err, getInstallKeyFromContext(this.context.acquisitionContext)));
        throw err;
    }

    protected abstract isPackageFoundInSearch(resultOfSearchCommand : any) : boolean;
}