import { DotnetAcquisitionDistroUnknownError, DotnetConflictingLinuxInstallTypesError, DotnetCustomLinuxInstallExistsError } from '../EventStream/EventStreamEvents';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { GenericDistroSDKProvider as GenericDistroSDKProvider } from './GenericDistroSDKProvider';
import * as proc from 'child_process';
import * as fs from 'fs';
import path = require('path');
import { VersionResolver } from './VersionResolver';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';

/**
 * An enumeration type representing all distros with their versions that we recognize.
 * @remarks
 * Each . in a semver should be represented with _.
 * The string representation of the enum should contain exactly one space that separates the distro, then the version.
 */
export interface DistroVersionPair {
    [distro: string]: string;
}

/**
 * @remarks
 * Distro support means that the distro provides a dotnet sdk package by default without intervention.
 *
 * Microsoft support means that Microsoft provides packages for the distro but it's not in the distro maintained feed.
 * For Microsoft support, we currently don't support installs of these feeds yet.
 *
 * Partial support does not have any change in behavior from unsupported currently and can mean whatever the distro maintainer wants.
 * But it generally means that the distro and microsoft both do not officially support that version of dotnet.
 *
 * Unknown is a placeholder for development testing and future potential implementation and should not be used by contributors.
 */
export const enum DotnetDistroSupportStatus {
    Unsupported = 'UNSUPPORTED',
	Distro = 'DISTRO',
    Microsoft = 'MICROSOFT',
    Partial = 'PARTIAL',
    Unknown = 'UNKNOWN'
}

/**
 * This class is responsible for detecting the distro and version of the Linux OS.
 * It also serves as the entry point to installation via a specific distro implementation
 * by implementing version validation that normally happens inside of a windows or mac .net installer.
 * Since those don't exist for linux, we need to manually implement and check certain edge-cases before allowing the installation to occur.
 */
export class DotnetGlobalSDKLinuxInstallerResolver
{
    private distro : DistroVersionPair = {};
    public readonly distroSDKProvider: IDistroDotnetSDKProvider;

    protected acquisitionContext : IAcquisitionWorkerContext;

    constructor(acquisitionContext : IAcquisitionWorkerContext)
    {
        this.acquisitionContext = acquisitionContext;
        this.distro = this.getRunningDistro();
        this.distroSDKProvider = this.DistroProviderFactory(this.distro);
    }

    private getRunningDistro() : DistroVersionPair
    {
        const commandResult = proc.spawnSync('cat', ['/etc/os-release']);
        const distroNameKey = 'NAME';
        const distroVersionKey = 'VERSION_ID';

        const stdOut = commandResult.stdout.toString().split("\n");
        // We need to remove the quotes from the KEY="VALUE"\n pairs returned by the command stdout, and then turn it into a dictionary. We can't use replaceAll for older browsers.
        // Replace only replaces one quote, so we remove the 2nd one later.
        const stdOutWithQuotesRemoved = stdOut.map( x => x.replace('"', ''));
        const stdOutWithSeparatedKeyValues = stdOutWithQuotesRemoved.map( x => x.split('='));
        const keyValueMap =  Object.fromEntries(stdOutWithSeparatedKeyValues.map(x => [x[0], x[1]]));

        // Remove the 2nd quotes.
        const distroName : string = keyValueMap[distroNameKey]?.replace('"', '') ?? '';
        const distroVersion : string = keyValueMap[distroVersionKey]?.replace('"', '') ?? '';

        if(distroName == '' || distroVersion == '')
        {
            const error = new DotnetAcquisitionDistroUnknownError(new Error('We are unable to detect the distro or version of your machine'));
            this.acquisitionContext.eventStream.post(error);
            throw error;
        }

        let pair : DistroVersionPair = {};
        pair = { distroName : distroVersion };

        
        return pair;
    }


    private DistroProviderFactory(distroAndVersion : DistroVersionPair) : IDistroDotnetSDKProvider
    {
        switch(distroAndVersion)
        {
            // Implement any custom logic for a Distro Class in a new DistroSDKProvider and add it to the factory here.
            default:
                return new GenericDistroSDKProvider(this.distro);
        }
    }

    private async ValidateVersionFeatureBand(version : string, existingGlobalDotnetVersion : string)
    {


    }

    public async ValidateAndInstallSDK(fullySpecifiedDotnetVersion : string) : Promise<string>
    {
        // Verify the version of dotnet is supported
        if (!( await this.distroSDKProvider.isDotnetVersionSupported(fullySpecifiedDotnetVersion) ))
        {
            throw new Error(`The distro ${this.distro} does not officially support dotnet version ${fullySpecifiedDotnetVersion}.`);
        }

        // Verify there are no conflicting installs
        // Check existing installs ...
        const supportStatus = await this.distroSDKProvider.getDotnetVersionSupportStatus(fullySpecifiedDotnetVersion);
        if(supportStatus === DotnetDistroSupportStatus.Distro)
        {
            const microsoftFeedDir = await this.distroSDKProvider.getExpectedDotnetMicrosoftFeedInstallationDirectory();
            if(fs.existsSync(microsoftFeedDir))
            {
                const err = new DotnetConflictingLinuxInstallTypesError(new Error(`A dotnet installation was found in ${microsoftFeedDir} which indicates dotnet that was installed via Microsoft package feeds. But for this distro and version, we only acquire .NET via the distro feeds.
                    You should not mix distro feed and microsoft feed installations. To continue, please completely remove this version of dotnet to continue by following https://learn.microsoft.com/dotnet/core/install/remove-runtime-sdk-versions?pivots=os-linux`), 
                    fullySpecifiedDotnetVersion);
                this.acquisitionContext.eventStream.post(err);
                throw err;
            }
        }
        else if(supportStatus === DotnetDistroSupportStatus.Microsoft)
        {
            const distroFeedDir = await this.distroSDKProvider.getExpectedDotnetDistroFeedInstallationDirectory();
            if(fs.existsSync(distroFeedDir))
            {
                const err = new DotnetConflictingLinuxInstallTypesError(new Error(`A dotnet installation was found in ${distroFeedDir} which indicates dotnet that was installed via distro package feeds. But for this distro and version, we only acquire .NET via the Microsoft feeds.
                    You should not mix distro feed and microsoft feed installations. To continue, please completely remove this version of dotnet to continue by following https://learn.microsoft.com/dotnet/core/install/remove-runtime-sdk-versions?pivots=os-linux`), 
                    fullySpecifiedDotnetVersion);
                this.acquisitionContext.eventStream.post(err);
                throw err;
            }
        }

        const existingInstall = await this.distroSDKProvider.getInstalledGlobalDotnetPathIfExists();
        // Check for a custom install
        if(existingInstall && path.resolve(existingInstall) !== path.resolve(supportStatus === DotnetDistroSupportStatus.Distro ? await this.distroSDKProvider.getExpectedDotnetDistroFeedInstallationDirectory() : await this.distroSDKProvider.getExpectedDotnetMicrosoftFeedInstallationDirectory() ))
        {
            const err = new DotnetCustomLinuxInstallExistsError(new Error(`A custom dotnet installation exists at ${existingInstall}.
                If we were to install another .NET, we would break your custom .NET installation, so the installation request has been refused.
                If you would like to proceed with installing .NET automatically for VS Code, you must remove this custom installation.`), 
            fullySpecifiedDotnetVersion);
            this.acquisitionContext.eventStream.post(err);
            throw err;
        }
        // Check if we need to install or not, if we can install (if the version conflicts with an existing one), or if we can just update the existing install.
        else if(existingInstall)
        {
            const existingGlobalInstallSDKVersion = await this.distroSDKProvider.getInstalledGlobalDotnetVersionIfExists();
            if(existingGlobalInstallSDKVersion && Number(VersionResolver.getMajorMinor(existingGlobalInstallSDKVersion)) === Number(VersionResolver.getMajorMinor(fullySpecifiedDotnetVersion)))
            {
                if(Number(VersionResolver.getMajorMinor(existingGlobalInstallSDKVersion)) > Number(VersionResolver.getMajorMinor(fullySpecifiedDotnetVersion)))
                {
                    // We shouldn't downgrade to a lower patch
                    const err = new DotnetCustomLinuxInstallExistsError(new Error(`An installation of ${fullySpecifiedDotnetVersion} was requested but ${existingGlobalInstallSDKVersion} is already available.`), 
                        fullySpecifiedDotnetVersion);
                    this.acquisitionContext.eventStream.post(err);
                    throw err;
                }
                else if(await this.distroSDKProvider.dotnetPackageExistsOnSystem(fullySpecifiedDotnetVersion) ||
                    Number(VersionResolver.getFeatureBandPatchVersion(existingGlobalInstallSDKVersion)) < Number(VersionResolver.getFeatureBandPatchVersion(fullySpecifiedDotnetVersion)))
                {
                    // We can update instead of doing an install 
                    return (await this.distroSDKProvider.upgradeDotnet(existingGlobalInstallSDKVersion)) ? '0' : '1';
                }
                else
                {
                    // An existing install exists. 
                    return '0';
                }
            }
            // Additional logic to check the major.minor could be added here if we wanted to prevent installing lower major.minors if an existing install existed.
        }

        return await this.distroSDKProvider.installDotnet() ? '0' : '1';
    }

}
