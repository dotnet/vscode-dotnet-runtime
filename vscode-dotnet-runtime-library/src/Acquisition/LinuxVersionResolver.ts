import { DotnetAcquisitionDistroUnknownError, DotnetConflictingLinuxInstallTypesError, DotnetCustomLinuxInstallExistsError } from '../EventStream/EventStreamEvents';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { GenericDistroSDKProvider as GenericDistroSDKProvider } from './GenericDistroSDKProvider';
import * as fs from 'fs';
import path = require('path');
import { VersionResolver } from './VersionResolver';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { CommandExecutor } from '../Utils/CommandExecutor';

/**
 * An enumeration type representing all distros with their versions that we recognize.
 * @remarks
 * Each . in a semver should be represented with _.
 * The string representation of the enum should contain exactly one space that separates the distro, then the version.
 */
export interface DistroVersionPair {
    distro : string,
    version : string
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
export class LinuxVersionResolver
{
    private distro : DistroVersionPair | null = null;
    public distroSDKProvider : IDistroDotnetSDKProvider | null = null;
    protected commandRunner : ICommandExecutor;
    protected acquisitionContext : IAcquisitionWorkerContext;

    public conflictingInstallErrorMessage = `A dotnet installation was found which indicates dotnet that was installed via Microsoft package feeds. But for this distro and version, we only acquire .NET via the distro feeds.
    You should not mix distro feed and microsoft feed installations. To continue, please completely remove this version of dotnet to continue by following https://learn.microsoft.com/dotnet/core/install/remove-runtime-sdk-versions?pivots=os-linux.
    Your install location: `;
    public conflictingCustomInstallErrorMessage = `A custom dotnet installation exists.
    If we were to install another .NET, we would break your custom .NET installation, so the installation request has been refused.
    If you would like to proceed with installing .NET automatically for VS Code, you must remove this custom installation.
    Your custom install is located at: `;
    public baseUnsupportedDistroErrorMessage = 'We are unable to detect the distro or version of your machine';

    constructor(acquisitionContext : IAcquisitionWorkerContext, executor : ICommandExecutor | null = null, distroProvider : IDistroDotnetSDKProvider | null = null)
    {
        this.commandRunner = executor ?? new CommandExecutor();
        this.acquisitionContext = acquisitionContext;
        if(distroProvider)
        {
            this.distroSDKProvider = distroProvider;
        }
    }

    /**
     * @remarks relies on /etc/os-release currently. public for testing purposes.
     * @returns The linux distro and version thats running this app. Should only ever be ran on linux.
     */
    public async getRunningDistro() : Promise<DistroVersionPair>
    {
        if(this.distro)
        {
            return this.distro;
        }

        const commandResult = (await this.commandRunner.execute('cat /etc/os-release'))[0];
        const distroNameKey = 'NAME';
        const distroVersionKey = 'VERSION_ID';

        try
        {
            const stdOut = commandResult.toString().split("\n");
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
                const error = new DotnetAcquisitionDistroUnknownError(new Error(this.baseUnsupportedDistroErrorMessage));
                this.acquisitionContext.eventStream.post(error);
                throw error;
            }

            let pair : DistroVersionPair = { distro : distroName, version : distroVersion };
            return pair;
        }
        catch(error)
        {
            const err = new DotnetAcquisitionDistroUnknownError(new Error(this.baseUnsupportedDistroErrorMessage + ' ... does /etc/os-release exist?'));
            this.acquisitionContext.eventStream.post(err);
            throw err;
        }
    }


    /**
     * @remarks we need to call the command executor to allow us to test this class.
     * The command executor needs to be able to run async commands. We cant call async commands in the constructor.
     * So we have to use this pattern of calling initialize to verify our members are not null in each function.
     */
    public async Initialize()
    {
        if(!this.distro)
        {
            this.distro = await this.getRunningDistro();
        }

        if(!this.distroSDKProvider)
        {
            this.distroSDKProvider = this.DistroProviderFactory(this.distro);
        }

        if(!this.distro || !this.distroSDKProvider)
        {
            const error = new DotnetAcquisitionDistroUnknownError(new Error(this.baseUnsupportedDistroErrorMessage + ' ... we cannot initialize.'));
            throw error;
        }
    }

    private DistroProviderFactory(distroAndVersion : DistroVersionPair) : IDistroDotnetSDKProvider
    {
        switch(distroAndVersion)
        {
            // Implement any custom logic for a Distro Class in a new DistroSDKProvider and add it to the factory here.
            case null:
                const error = new DotnetAcquisitionDistroUnknownError(new Error(this.baseUnsupportedDistroErrorMessage));
                throw error;
            default:
                return new GenericDistroSDKProvider(distroAndVersion);
        }
    }

    /**
     *
     * @param supportStatus The support status of this distro and version pair.
     * @param fullySpecifiedDotnetVersion The version of dotnet requested to install, upgrade, etc.
     * @remarks Throws a specific error below if a conflicting install type of dotnet exists on linux.
     * Microsoft and distro feed packages together cause system instability with dotnet, so we dont want to let people get into those states.
     * Eventually, we could add logic to remove them for users, but that may require consent first.
     */
    public async VerifyNoConflictInstallTypeExists(supportStatus : DotnetDistroSupportStatus, fullySpecifiedDotnetVersion : string) : Promise<void>
    {
        await this.Initialize();

        if(supportStatus === DotnetDistroSupportStatus.Distro)
        {
            const microsoftFeedDir = await this.distroSDKProvider!.getExpectedDotnetMicrosoftFeedInstallationDirectory();
            if(fs.existsSync(microsoftFeedDir))
            {
                const err = new DotnetConflictingLinuxInstallTypesError(new Error(this.conflictingInstallErrorMessage + microsoftFeedDir),
                    fullySpecifiedDotnetVersion);
                this.acquisitionContext.eventStream.post(err);
                throw err;
            }
        }
        else if(supportStatus === DotnetDistroSupportStatus.Microsoft)
        {
            const distroFeedDir = await this.distroSDKProvider!.getExpectedDotnetDistroFeedInstallationDirectory();
            if(fs.existsSync(distroFeedDir))
            {
                const err = new DotnetConflictingLinuxInstallTypesError(new Error(this.conflictingInstallErrorMessage + distroFeedDir),
                    fullySpecifiedDotnetVersion);
                this.acquisitionContext.eventStream.post(err);
                throw err;
            }
        }
    }

    /**
     * Similar to VerifyNoConflictInstallTypeExists, but checks if a custom install exists. We dont want to override that.
     * It could also cause unstable behavior and break a users current setup.
     */
    private async VerifyNoCustomInstallExists(supportStatus : DotnetDistroSupportStatus, fullySpecifiedDotnetVersion : string, existingInstall : string | null) : Promise<void>
    {
        await this.Initialize();

        if(existingInstall && path.resolve(existingInstall) !== path.resolve(supportStatus === DotnetDistroSupportStatus.Distro ? await this.distroSDKProvider!.getExpectedDotnetDistroFeedInstallationDirectory() : await this.distroSDKProvider!.getExpectedDotnetMicrosoftFeedInstallationDirectory() ))
        {
            const err = new DotnetCustomLinuxInstallExistsError(new Error(this.conflictingCustomInstallErrorMessage + existingInstall),
            fullySpecifiedDotnetVersion);
            this.acquisitionContext.eventStream.post(err);
            throw err;
        }
    }

    /**
     *
     * @param fullySpecifiedDotnetVersion The version to install of the dotnet sdk.
     * @param existingInstall a path to the existing dotnet install on the machine.
     * @returns 0 if we can proceed. Will throw if a conflicting install exists. If we can update, it will do the update and return 1.
     * A string is returned in case we want to make this return more info about the update.
     */
    private async UpdateOrRejectIfVersionRequestDoesNotRequireInstall(fullySpecifiedDotnetVersion : string, existingInstall : string | null)
    {
        await this.Initialize();

        if(existingInstall)
        {
            const existingGlobalInstallSDKVersion = await this.distroSDKProvider!.getInstalledGlobalDotnetVersionIfExists();
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
                else if(await this.distroSDKProvider!.dotnetPackageExistsOnSystem(fullySpecifiedDotnetVersion) ||
                    Number(VersionResolver.getFeatureBandPatchVersion(existingGlobalInstallSDKVersion)) < Number(VersionResolver.getFeatureBandPatchVersion(fullySpecifiedDotnetVersion)))
                {
                    // We can update instead of doing an install
                    return (await this.distroSDKProvider!.upgradeDotnet(existingGlobalInstallSDKVersion)) ? '1' : '1';
                }
                else
                {
                    // An existing install exists.
                    return '1';
                }
            }
            // Additional logic to check the major.minor could be added here if we wanted to prevent installing lower major.minors if an existing install existed.
        }
        return '0';
    }

    public async ValidateAndInstallSDK(fullySpecifiedDotnetVersion : string) : Promise<string>
    {
        await this.Initialize();

        // Verify the version of dotnet is supported
        if (!( await this.distroSDKProvider!.isDotnetVersionSupported(fullySpecifiedDotnetVersion) ))
        {
            throw new Error(`The distro ${this.distro} does not officially support dotnet version ${fullySpecifiedDotnetVersion}.`);
        }

        // Verify there are no conflicting installs
        // Check existing installs ...
        const supportStatus = await this.distroSDKProvider!.getDotnetVersionSupportStatus(fullySpecifiedDotnetVersion);
        await this.VerifyNoConflictInstallTypeExists(supportStatus, fullySpecifiedDotnetVersion);

        const existingInstall = await this.distroSDKProvider!.getInstalledGlobalDotnetPathIfExists();
        // Check for a custom install
        await this.VerifyNoCustomInstallExists(supportStatus, fullySpecifiedDotnetVersion, existingInstall);

        // Check if we need to install or not, if we can install (if the version conflicts with an existing one), or if we can just update the existing install.
        const updateOrRejectState = await this.UpdateOrRejectIfVersionRequestDoesNotRequireInstall(fullySpecifiedDotnetVersion, existingInstall);
        if(updateOrRejectState == '0')
        {
            return await this.distroSDKProvider!.installDotnet(fullySpecifiedDotnetVersion) ? '0' : '1';
        }
        return updateOrRejectState;
    }

}
