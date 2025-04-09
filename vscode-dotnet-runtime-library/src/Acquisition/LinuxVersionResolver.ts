/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';
import
{
    DotnetAcquisitionDistroUnknownError,
    DotnetConflictingLinuxInstallTypesError,
    DotnetCustomLinuxInstallExistsError,
    DotnetInstallLinuxChecks,
    DotnetUpgradedEvent,
    EventBasedError,
    EventCancellationError
} from '../EventStream/EventStreamEvents';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { FileUtilities } from '../Utils/FileUtilities';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { getInstallFromContext } from '../Utils/InstallIdUtilities';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { SYSTEM_INFORMATION_CACHE_DURATION_MS } from './CacheTimeConstants';
import { DebianDistroSDKProvider } from './DebianDistroSDKProvider';
import { DotnetInstallMode } from './DotnetInstallMode';
import { GenericDistroSDKProvider } from './GenericDistroSDKProvider';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { RedHatDistroSDKProvider } from './RedHatDistroSDKProvider';
import { VersionResolver } from './VersionResolver';
import * as versionUtils from './VersionUtilities';
import { DEBIAN_DISTRO_INFO_KEY, RED_HAT_DISTRO_INFO_KEY, UBUNTU_DISTRO_INFO_KEY } from './StringConstants';


/**
 * An enumeration type representing all distros with their versions that we recognize.
 * @remarks
 * Each . in a semver should be represented with _.
 * The string representation of the enum should contain exactly one space that separates the distro, then the version.
 */
export interface DistroVersionPair
{
    distro: string,
    version: string
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
export const enum DotnetDistroSupportStatus
{
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
    private distro: DistroVersionPair | null = null;
    protected distroSDKProvider: IDistroDotnetSDKProvider | null = null;
    protected commandRunner: ICommandExecutor;
    protected versionResolver: VersionResolver;
    public okUpdateExitCode = 11188; // Arbitrary number that is not shared or used by other things we rely on as an exit code
    public okAlreadyExistsExitCode = 11166;

    public conflictingInstallErrorMessage = `A dotnet installation was found which indicates dotnet that was installed via Microsoft package feeds. But for this distro and version, we only acquire .NET via the distro feeds.
    You should not mix distro feed and microsoft feed installations. To continue, please completely remove this version of dotnet to continue by following https://learn.microsoft.com/dotnet/core/install/remove-runtime-sdk-versions?pivots=os-linux.
    Your install location: `;
    public conflictingCustomInstallErrorMessage = `A custom dotnet installation exists.
    If we were to install another .NET, we would break your custom .NET installation, so the installation request has been refused.
    If you would like to proceed with installing .NET automatically for VS Code, you must remove this custom installation.
    Your custom install is located at: `;
    public baseUnsupportedDistroErrorMessage = 'We are unable to detect the distro or version of your machine';
    public unsupportedDistroErrorMessage = `Your current distro is not yet supported. We are expanding this list based on community feed back and contributions.
If you would like to contribute to the list of supported distros, please visit: https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/adding-distros.md`;
    public redhatUnsupportedDistroErrorMessage = `Red Hat Enterprise Linux 7.0 is currently not supported.
Follow the instructions here to download the .NET SDK: https://learn.microsoft.com/en-us/dotnet/core/install/linux-rhel#rhel-7--net-6.
Or, install Red Hat Enterprise Linux 8.0 or Red Hat Enterprise Linux 9.0 from https://access.redhat.com/downloads/;`
    protected acquireCtx: IDotnetAcquireContext | null | undefined;

    // This includes all distros that we officially support for this tool as a company. If a distro is not in this list, it can still have community member support.
    public microsoftSupportedDistroIds = [RED_HAT_DISTRO_INFO_KEY, UBUNTU_DISTRO_INFO_KEY];

    constructor(private readonly workerContext: IAcquisitionWorkerContext, private readonly utilityContext: IUtilityContext,
        executor: ICommandExecutor | null = null, distroProvider: IDistroDotnetSDKProvider | null = null)
    {
        this.commandRunner = executor ?? new CommandExecutor(this.workerContext, this.utilityContext);
        this.versionResolver = new VersionResolver(workerContext);
        if (distroProvider)
        {
            this.distroSDKProvider = distroProvider;
        }

        this.acquireCtx = this.workerContext.acquisitionContext;
    }

    /**
     * @remarks relies on /etc/os-release currently. public for testing purposes.
     * @returns The linux distro and version thats running this app. Should only ever be ran on linux.
     */
    public async getRunningDistro(): Promise<DistroVersionPair>
    {
        if (this.distro)
        {
            return this.distro;
        }

        const commandResult = await this.commandRunner.execute(CommandExecutor.makeCommand(`cat`, [`/etc/os-release`]), { dotnetInstallToolCacheTtlMs: SYSTEM_INFORMATION_CACHE_DURATION_MS });
        const distroNameKey = 'NAME';
        const distroVersionKey = 'VERSION_ID';

        try
        {
            const stdOut = commandResult.stdout.toString().split('\n');
            // We need to remove the quotes from the KEY="VALUE"\n pairs returned by the command stdout, and then turn it into a dictionary. We can't use replaceAll for older browsers.
            // Replace only replaces one quote, so we remove the 2nd one later.
            const stdOutWithQuotesRemoved = stdOut.map(x => x.replace('"', ''));
            const stdOutWithSeparatedKeyValues = stdOutWithQuotesRemoved.map(x => x.split('='));
            const keyValueMap = Object.fromEntries(stdOutWithSeparatedKeyValues.map(x => [x[0], x[1]]));

            // Remove the 2nd quotes.
            const distroName: string = keyValueMap[distroNameKey]?.replace('"', '') ?? '';
            const distroVersion: string = keyValueMap[distroVersionKey]?.replace('"', '') ?? '';

            if (distroName === '' || distroVersion === '')
            {
                const error = new DotnetAcquisitionDistroUnknownError(new EventCancellationError('DotnetAcquisitionDistroUnknownError',
                    this.baseUnsupportedDistroErrorMessage), getInstallFromContext(this.workerContext));
                this.workerContext.eventStream.post(error);
                throw error.error;
            }

            const pair: DistroVersionPair = { distro: distroName, version: distroVersion };
            return pair;
        }
        catch (error)
        {
            const err = new DotnetAcquisitionDistroUnknownError(new EventCancellationError('DotnetAcquisitionDistroUnknownError',
                `${this.baseUnsupportedDistroErrorMessage} ... does /etc/os-release exist?`),
                getInstallFromContext(this.workerContext));
            this.workerContext.eventStream.post(err);
            throw err.error;
        }
    }


    /**
     * @remarks we need to call the command executor to allow us to test this class.
     * The command executor needs to be able to run async commands. We cant call async commands in the constructor.
     * So we have to use this pattern of calling initialize to verify our members are not null in each function.
     */
    public async Initialize()
    {
        if (!this.distro)
        {
            this.distro = await this.getRunningDistro();
        }

        if (!this.distroSDKProvider)
        {
            this.distroSDKProvider = this.DistroProviderFactory(this.distro);
        }

        if (!this.distro || !this.distroSDKProvider)
        {
            const error = new DotnetAcquisitionDistroUnknownError(new EventCancellationError(
                'DotnetAcquisitionDistroUnknownError',
                `${this.baseUnsupportedDistroErrorMessage} ... we cannot initialize.`),
                getInstallFromContext(this.workerContext));
            this.workerContext.eventStream.post(error);
            throw error.error;
        }
        else
        {
            if (!this.microsoftSupportedDistroIds.includes(this.distro.distro))
            {
                // UX: Could eventually add a 'Go away' button via the callback:
                this.utilityContext.ui.showInformationMessage(`Automated SDK installation for the distro ${this.distro.distro} is not officially supported, except for community implemented and Microsoft approved support.
If you experience issues, please reach out on https://github.com/dotnet/vscode-dotnet-runtime/issues.`,
                    () => {/* No Callback */ },
                );
            }
        }
    }

    private isRedHatVersion7(rhelVersion: string)
    {
        if (Math.floor(parseFloat(rhelVersion)) === 7)
        {
            return true;
        }
        return false;
    }

    private DistroProviderFactory(distroAndVersion: DistroVersionPair): IDistroDotnetSDKProvider
    {
        switch (distroAndVersion.distro)
        {
            // Implement any custom logic for a Distro Class in a new DistroSDKProvider and add it to the factory here.
            case null:
                const unknownDistroErr = new DotnetAcquisitionDistroUnknownError(new EventCancellationError(
                    'DotnetAcquisitionDistroUnknownError',
                    this.unsupportedDistroErrorMessage), getInstallFromContext(this.workerContext));
                this.workerContext.eventStream.post(unknownDistroErr);
                throw unknownDistroErr.error;
            case RED_HAT_DISTRO_INFO_KEY:
                if (this.isRedHatVersion7(distroAndVersion.version))
                {
                    const unsupportedRhelErr = new DotnetAcquisitionDistroUnknownError(new EventCancellationError(
                        'DotnetAcquisitionDistroUnknownError',
                        this.redhatUnsupportedDistroErrorMessage),
                        getInstallFromContext(this.workerContext));
                    this.workerContext.eventStream.post(unsupportedRhelErr);
                    throw unsupportedRhelErr.error;
                }
                return new RedHatDistroSDKProvider(distroAndVersion, this.workerContext, this.utilityContext);
            case DEBIAN_DISTRO_INFO_KEY:
                return new DebianDistroSDKProvider(distroAndVersion, this.workerContext, this.utilityContext);
            default:
                return new GenericDistroSDKProvider(distroAndVersion, this.workerContext, this.utilityContext);
        }
    }

    /**
     *
     * @param supportStatus The support status of this distro and version pair.
     * @param fullySpecifiedDotnetVersion The version of dotnet requested to install, upgrade, etc.
     * @remarks Throws a specific error below if a conflicting install type of dotnet exists on linux.
     * Microsoft and distro feed packages together cause system instability with dotnet, so we don't want to let people get into those states.
     * Eventually, we could add logic to remove them for users, but that may require consent first.
     */
    public async VerifyNoConflictInstallTypeExists(supportStatus: DotnetDistroSupportStatus, fullySpecifiedDotnetVersion: string): Promise<void>
    {
        await this.Initialize();

        if (supportStatus === DotnetDistroSupportStatus.Distro)
        {
            const microsoftFeedDir = this.distroSDKProvider!.getExpectedDotnetMicrosoftFeedInstallationDirectory();
            if (await new FileUtilities().exists(microsoftFeedDir))
            {
                const err = new DotnetConflictingLinuxInstallTypesError(new EventCancellationError('DotnetConflictingLinuxInstallTypesError',
                    this.conflictingInstallErrorMessage + microsoftFeedDir),
                    getInstallFromContext(this.workerContext));
                this.workerContext.eventStream.post(err);
                throw err.error;
            }
        }
        else if (supportStatus === DotnetDistroSupportStatus.Microsoft)
        {
            const distroFeedDir = this.distroSDKProvider!.getExpectedDotnetDistroFeedInstallationDirectory();
            if (await new FileUtilities().exists(distroFeedDir))
            {
                const err = new DotnetConflictingLinuxInstallTypesError(new EventCancellationError('DotnetConflictingLinuxInstallTypesError',
                    this.conflictingInstallErrorMessage + distroFeedDir),
                    getInstallFromContext(this.workerContext));
                this.workerContext.eventStream.post(err);
                throw err.error;
            }
        }
    }

    /**
     * Similar to VerifyNoConflictInstallTypeExists, but checks if a custom install exists. We don't want to override that.
     * It could also cause unstable behavior and break a users current setup.
     */
    private async VerifyNoCustomInstallExists(supportStatus: DotnetDistroSupportStatus, fullySpecifiedDotnetVersion: string, existingInstall: string | null): Promise<void>
    {
        await this.Initialize();

        if (existingInstall && path.resolve(existingInstall) !== path.resolve(
            supportStatus === DotnetDistroSupportStatus.Distro ? this.distroSDKProvider!.getExpectedDotnetDistroFeedInstallationDirectory()
                : this.distroSDKProvider!.getExpectedDotnetMicrosoftFeedInstallationDirectory()))
        {
            const err = new DotnetCustomLinuxInstallExistsError(new EventCancellationError('DotnetCustomLinuxInstallExistsError',
                this.conflictingCustomInstallErrorMessage + existingInstall),
                getInstallFromContext(this.workerContext));
            this.workerContext.eventStream.post(err);
            throw err.error;
        }
    }

    /**
     *
     * @param fullySpecifiedDotnetVersion The version to install of the dotnet sdk.
     * @param existingInstall a path to the existing dotnet install on the machine.
     * @returns 0 if we can proceed. Will throw if a conflicting install exists. If we can update, it will do the update and return 1.
     * A string is returned in case we want to make this return more info about the update.
     * @remarks it is expected you are holding the global modifier lock when calling this function.
     */
    private async UpdateOrRejectIfVersionRequestDoesNotRequireInstall(fullySpecifiedDotnetVersion: string, existingInstall: string | null): Promise<string>
    {
        await this.Initialize();

        this.workerContext.eventStream.post(new DotnetInstallLinuxChecks(`Checking to see if we should install, update, or cancel...`));
        if (existingInstall)
        {
            const existingGlobalInstallSDKVersion = await this.distroSDKProvider!.getInstalledGlobalDotnetVersionIfExists();
            if (existingGlobalInstallSDKVersion && Number(versionUtils.getMajorMinor(existingGlobalInstallSDKVersion, this.workerContext.eventStream, this.workerContext)) ===
                Number(versionUtils.getMajorMinor(fullySpecifiedDotnetVersion, this.workerContext.eventStream, this.workerContext)))
            {
                const isPatchUpgrade = Number(versionUtils.getFeatureBandPatchVersion(existingGlobalInstallSDKVersion, this.workerContext.eventStream, this.workerContext)) <
                    Number(versionUtils.getFeatureBandPatchVersion(fullySpecifiedDotnetVersion, this.workerContext.eventStream, this.workerContext));

                if (Number(versionUtils.getMajorMinor(existingGlobalInstallSDKVersion, this.workerContext.eventStream, this.workerContext)) >
                    Number(versionUtils.getMajorMinor(fullySpecifiedDotnetVersion, this.workerContext.eventStream, this.workerContext))
                    || Number(versionUtils.getFeatureBandFromVersion(existingGlobalInstallSDKVersion, this.workerContext.eventStream, this.workerContext)) >
                    Number(versionUtils.getFeatureBandFromVersion(fullySpecifiedDotnetVersion, this.workerContext.eventStream, this.workerContext)))
                {
                    // We shouldn't downgrade to a lower patch
                    const err = new DotnetCustomLinuxInstallExistsError(new EventCancellationError('DotnetCustomLinuxInstallExistsError',
                        `An installation of ${fullySpecifiedDotnetVersion} was requested but ${existingGlobalInstallSDKVersion} is already available.`),
                        getInstallFromContext(this.workerContext));
                    this.workerContext.eventStream.post(err);
                    throw err.error;
                }
                else if (await this.distroSDKProvider!.dotnetPackageExistsOnSystem(fullySpecifiedDotnetVersion, 'sdk') || isPatchUpgrade)
                {
                    // We can update instead of doing an install
                    this.workerContext.eventStream.post(new DotnetUpgradedEvent(
                        isPatchUpgrade ?
                            `Updating .NET: Current Version: ${existingGlobalInstallSDKVersion} to ${fullySpecifiedDotnetVersion}.`
                            :
                            `Repairing .NET Packages for ${existingGlobalInstallSDKVersion}.`));
                    return (await this.distroSDKProvider!.upgradeDotnet(existingGlobalInstallSDKVersion, 'sdk')) === '0' ? String(this.okUpdateExitCode) : '1';
                }
                else
                {
                    // An existing install exists.
                    return String(this.okAlreadyExistsExitCode);
                }
            }
            // Additional logic to check the major.minor could be added here if we wanted to prevent installing lower major.minors if an existing install existed.
        }
        return '0';
    }

    // It is expected you are holding the global modifier lock when calling this function.
    public async ValidateAndInstallSDK(fullySpecifiedDotnetVersion: string): Promise<string>
    {
        await this.Initialize();

        // Verify the version of dotnet is supported
        if (!(await this.distroSDKProvider!.isDotnetVersionSupported(fullySpecifiedDotnetVersion, 'sdk')))
        {
            throw new EventBasedError('UnsupportedDistro', `The distro ${this.distro?.distro} ${this.distro?.version} does not officially support dotnet version ${fullySpecifiedDotnetVersion}.`);
        }

        // Verify there are no conflicting installs
        // Check existing installs ...
        const supportStatus = await this.distroSDKProvider!.getDotnetVersionSupportStatus(fullySpecifiedDotnetVersion, 'sdk');
        await this.VerifyNoConflictInstallTypeExists(supportStatus, fullySpecifiedDotnetVersion);

        const existingInstall = await this.distroSDKProvider!.getInstalledGlobalDotnetPathIfExists('sdk');
        // Check for a custom install
        await this.VerifyNoCustomInstallExists(supportStatus, fullySpecifiedDotnetVersion, existingInstall);

        // Check if we need to install or not, if we can install (if the version conflicts with an existing one), or if we can just update the existing install.
        const updateOrRejectState = await this.UpdateOrRejectIfVersionRequestDoesNotRequireInstall(fullySpecifiedDotnetVersion, existingInstall);
        if (updateOrRejectState === '0')
        {
            return await this.distroSDKProvider!.installDotnet(fullySpecifiedDotnetVersion, 'sdk') ? '0' : '1';
        }
        else if (updateOrRejectState === String(this.okUpdateExitCode) || updateOrRejectState === String(this.okAlreadyExistsExitCode))
        {
            return '0';
        }
        return String(updateOrRejectState);
    }

    // @remarks It is expected you are holding the global modifier lock when calling this function.
    public async UninstallSDK(fullySpecifiedDotnetVersion: string): Promise<string>
    {
        await this.Initialize();
        return this.distroSDKProvider!.uninstallDotnet(fullySpecifiedDotnetVersion, 'sdk');
    }

    /**
     * This exposes the class member that may or may not be initialized before execution of this function
     * ... so other's can use it. (It is a terrible pattern but used because the ctor cannot be async.)
     * @returns the distroSDKProvider to call distro related functions on top of.
     */
    public async distroCall(): Promise<IDistroDotnetSDKProvider>
    {
        await this.Initialize();
        return this.distroSDKProvider!;
    }

    public async getRecommendedDotnetVersion(installType: DotnetInstallMode): Promise<string>
    {
        await this.Initialize();
        return this.distroSDKProvider!.getRecommendedDotnetVersion(installType);
    }
}
