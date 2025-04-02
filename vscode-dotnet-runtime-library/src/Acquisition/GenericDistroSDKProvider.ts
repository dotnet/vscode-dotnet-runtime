/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';

import { DistroPackagesSearch, DistroSupport, DotnetVersionResolutionError, EventBasedError } from '../EventStream/EventStreamEvents';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { READ_SYMLINK_CACHE_DURATION_MS } from './CacheTimeConstants';
import { DotnetInstallMode } from './DotnetInstallMode';
import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { DotnetDistroSupportStatus } from './LinuxVersionResolver';
import * as versionUtils from './VersionUtilities';

export class GenericDistroSDKProvider extends IDistroDotnetSDKProvider
{
    protected resolvePathAsSymlink = true;

    public async installDotnet(fullySpecifiedVersion: string, installType: DotnetInstallMode): Promise<string>
    {
        await this.injectPMCFeed(fullySpecifiedVersion, installType);

        let commands = this.myDistroCommands(this.installCommandKey);
        const sdkPackage = await this.myDotnetVersionPackageName(fullySpecifiedVersion, installType);

        commands = CommandExecutor.replaceSubstringsInCommands(commands, this.missingPackageNameKey, sdkPackage);
        const updateCommandsResult = (await this.commandRunner.executeMultipleCommands(commands.slice(0, -1), null, false))[0];
        const installCommandResult = (await this.commandRunner.execute(commands.slice(-1)[0], null, false)).status;

        return installCommandResult;
    }

    public async getInstalledGlobalDotnetPathIfExists(installType: DotnetInstallMode): Promise<string | null>
    {
        const commandResult = await this.commandRunner.executeMultipleCommands(this.myDistroCommands(this.currentInstallPathCommandKey), null, false);

        if (commandResult[0].status !== '0') // no dotnet error can be returned, do not want to try to parse this as a path
        {
            return null;
        }

        if (commandResult[0].stdout)
        {
            commandResult[0].stdout = commandResult[0].stdout.trim();
        }

        if (commandResult[0] && this.resolvePathAsSymlink)
        {
            let symLinkReadCommand = this.myDistroCommands(this.readSymbolicLinkCommandKey);
            symLinkReadCommand = CommandExecutor.replaceSubstringsInCommands(symLinkReadCommand, this.missingPathKey, commandResult[0].stdout);
            const resolvedPath = (await this.commandRunner.executeMultipleCommands(symLinkReadCommand, { dotnetInstallToolCacheTtlMs: READ_SYMLINK_CACHE_DURATION_MS }, false))[0].stdout;
            if (resolvedPath)
            {
                return path.dirname(resolvedPath.trim());
            }
        }

        return commandResult[0].stdout ?? null;
    }

    public async dotnetPackageExistsOnSystem(fullySpecifiedDotnetVersion: string, installType: DotnetInstallMode): Promise<boolean>
    {
        let command = this.myDistroCommands(this.packageLookupCommandKey);
        const sdkPackage = await this.myDotnetVersionPackageName(this.JsonDotnetVersion(fullySpecifiedDotnetVersion), installType);
        command = CommandExecutor.replaceSubstringsInCommands(command, this.missingPackageNameKey, sdkPackage);
        const commandResult = (await this.commandRunner.executeMultipleCommands(command, null, false))[0];

        return commandResult.status === '0';
    }

    public getExpectedDotnetDistroFeedInstallationDirectory(): string
    {
        return this.myDistroStrings(this.expectedDistroFeedInstallDirKey);
    }

    public getExpectedDotnetMicrosoftFeedInstallationDirectory(): string
    {
        return this.myDistroStrings(this.expectedMicrosoftFeedInstallDirKey);
    }

    public async upgradeDotnet(versionToUpgrade: string, installType: DotnetInstallMode): Promise<string>
    {
        let command = this.myDistroCommands(this.updateCommandKey);
        const sdkPackage = await this.myDotnetVersionPackageName(versionToUpgrade, installType);
        command = CommandExecutor.replaceSubstringsInCommands(command, this.missingPackageNameKey, sdkPackage);
        const commandResult = (await this.commandRunner.executeMultipleCommands(command, null, false))[0].status;

        return commandResult[0];
    }

    public async uninstallDotnet(versionToUninstall: string, installType: DotnetInstallMode): Promise<string>
    {
        let command = this.myDistroCommands(this.uninstallCommandKey);
        const sdkPackage = await this.myDotnetVersionPackageName(versionToUninstall, installType);
        command = CommandExecutor.replaceSubstringsInCommands(command, this.missingPackageNameKey, sdkPackage);
        const commandResult = (await this.commandRunner.executeMultipleCommands(command, null, false))[0];

        return commandResult.status;
    }

    public async getInstalledDotnetSDKVersions(): Promise<string[]>
    {
        const command = this.myDistroCommands(this.installedSDKVersionsCommandKey);
        const commandResult = (await this.commandRunner.executeMultipleCommands(command, {}, false))[0];

        const outputLines: string[] = commandResult.stdout.split('\n');
        const versions: string[] = [];

        for (const line of outputLines)
        {
            const splitLine = line.split(/\s+/);
            // list sdk lines shows in the form: version [path], so the version is the 2nd item
            if ((splitLine?.length ?? 0) === 2 && splitLine[0] !== '')
            {
                versions.push(splitLine[0]);
            }
        }
        return versions;
    }

    public async getInstalledDotnetRuntimeVersions(): Promise<string[]>
    {
        const command = this.myDistroCommands(this.installedRuntimeVersionsCommandKey);
        const commandResult = (await this.commandRunner.executeMultipleCommands(command, {}, false))[0];

        const outputLines: string[] = commandResult.stdout.split('\n');
        const versions: string[] = [];

        for (const line of outputLines)
        {
            const splitLine = line.split(/\s+/);
            // list runtimes lines shows in the form: runtime version [path], so the version is the 3rd item
            if ((splitLine?.length ?? 0) === 3)
            {
                versions.push(splitLine[1]);
            }
        }
        return versions;
    }

    public async getInstalledGlobalDotnetVersionIfExists(): Promise<string | null>
    {
        const command = this.myDistroCommands(this.currentInstallVersionCommandKey);

        // we need to run this command in the root directory otherwise local dotnets on the path may interfere
        const rootDir = path.parse(__dirname).root;
        const commandResult = (await this.commandRunner.executeMultipleCommands(command, { cwd: path.resolve(rootDir), shell: true }, false))[0];

        commandResult.stdout = commandResult.stdout.replace('\n', '');
        if (!versionUtils.isValidLongFormVersionFormat(commandResult.stdout, this.context.eventStream, this.context))
        {
            return null;
        }
        {
            return commandResult.stdout;
        }
    }

    public async getDotnetVersionSupportStatus(fullySpecifiedVersion: string, installType: DotnetInstallMode): Promise<DotnetDistroSupportStatus>
    {
        if (versionUtils.getFeatureBandFromVersion(fullySpecifiedVersion, this.context.eventStream, this.context) !== '1' ||
            Number(versionUtils.getMajor(fullySpecifiedVersion, this.context.eventStream, this.context)) < 6)
        {
            this.context.eventStream.post(new DistroSupport(`Distro: Dotnet Version ${fullySpecifiedVersion} is not supported by this extension. It has a non 1 level band or < 6.0.`));
            return Promise.resolve(DotnetDistroSupportStatus.Unsupported);
        }

        else
        {
            this.context.eventStream.post(new DistroSupport(`Couldn't find preinstallCmdKey for ${this.distroVersion.distro} ${this.distroVersion.version} with dotnet Version ${fullySpecifiedVersion}.`));
            const availableVersions = await this.myVersionPackages(installType, this.isMidFeedInjection);
            const simplifiedVersion = this.JsonDotnetVersion(fullySpecifiedVersion);

            for (const dotnetPackages of availableVersions)
            {
                if (Number(dotnetPackages.version) === Number(simplifiedVersion))
                {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    if (this.myVersionDetails().hasOwnProperty(this.preinstallCommandKey))
                    {
                        // If preinstall commands exist ( to add the msft feed ) then it's a microsoft feed.
                        this.context.eventStream.post(new DistroSupport(`Distro: Dotnet Version ${fullySpecifiedVersion} is Microsoft support, because it has preinstallCmdKey.`));
                        return Promise.resolve(DotnetDistroSupportStatus.Microsoft);
                    }
                    else
                    {
                        this.context.eventStream.post(new DistroSupport(`Version ${fullySpecifiedVersion} is Distro supported, because it has packages already.`));
                        return Promise.resolve(DotnetDistroSupportStatus.Distro);
                    }
                }
            }
        }

        this.context.eventStream.post(new DistroSupport(`Version ${fullySpecifiedVersion} is unknown for distro ${this.distroVersion.distro} ${this.distroVersion.version} with ${this.myVersionDetails()}`));
        return Promise.resolve(DotnetDistroSupportStatus.Unknown);
    }

    public async getRecommendedDotnetVersion(installType: DotnetInstallMode): Promise<string>
    {
        let maxVersion = '0';
        const json = await this.myVersionPackages(installType, this.isMidFeedInjection);
        for (const dotnetPackages of json)
        {
            if (Number(dotnetPackages.version) > Number(maxVersion))
            {
                this.context.eventStream.post(new DistroPackagesSearch(`Found version ${dotnetPackages.version} for .NET and and picking it, as it is higher than ${maxVersion}.`));
                maxVersion = dotnetPackages.version;
            }
            this.context.eventStream.post(new DistroPackagesSearch(`Skipping version ${dotnetPackages.version} for .NET and and picking it, as it is lower than ${maxVersion}.`));
        }

        if (maxVersion === '0')
        {
            const err = new DotnetVersionResolutionError(new EventBasedError('DotnetVersionResolutionError', `No packages for .NET are available.
Please refer to https://learn.microsoft.com/en-us/dotnet/core/install/linux if you'd link to install .NET.`), null);
            this.context.eventStream.post(err);
            throw (err);
        }

        // Most distros support only 100 band .NET versions, so we default to that here.
        return `${this.JsonDotnetVersion(maxVersion)}.1xx`;
    }

    public JsonDotnetVersion(fullySpecifiedDotnetVersion: string): string
    {
        return versionUtils.getMajorMinor(fullySpecifiedDotnetVersion, this.context.eventStream, this.context);
    }

    protected isPackageFoundInSearch(resultOfSearchCommand: any, searchCommandExitCode: string): boolean
    {
        return (resultOfSearchCommand as string).trim() !== '' && searchCommandExitCode === '0';
    }
}
