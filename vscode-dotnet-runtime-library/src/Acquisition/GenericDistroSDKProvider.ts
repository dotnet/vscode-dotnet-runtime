/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as path from 'path';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { CommandExecutorCommand } from '../Utils/CommandExecutorCommand';
import { DotnetDistroSupportStatus } from './LinuxVersionResolver';
import { LinuxInstallType } from './LinuxInstallType';
import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { DotnetVersionResolutionError } from '../EventStream/EventStreamEvents';
/* tslint:disable:no-any */

export class GenericDistroSDKProvider extends IDistroDotnetSDKProvider
{
    protected resolvePathAsSymlink = true;

    public async installDotnet(fullySpecifiedVersion : string, installType : LinuxInstallType): Promise<string>
    {
        await this.injectPMCFeed(fullySpecifiedVersion, installType);

        let commands = this.myDistroCommands(this.installCommandKey);
        const sdkPackage = await this.myDotnetVersionPackageName(fullySpecifiedVersion, installType);

        const oldReturnStatusSetting = this.commandRunner.returnStatus;
        this.commandRunner.returnStatus = true;
        commands = CommandExecutor.replaceSubstringsInCommands(commands, this.missingPackageNameKey, sdkPackage);
        const updateCommandsResult = (await this.commandRunner.executeMultipleCommands(commands.slice(0, -1), undefined))[0];
        const installCommandResult = await this.commandRunner.execute(commands.slice(-1)[0]);

        this.commandRunner.returnStatus = oldReturnStatusSetting;
        return installCommandResult;
    }

    public async getInstalledGlobalDotnetPathIfExists(installType : LinuxInstallType) : Promise<string | null>
    {
        const commandResult = await this.commandRunner.executeMultipleCommands(this.myDistroCommands(this.currentInstallPathCommandKey));

        const oldReturnStatusSetting = this.commandRunner.returnStatus;
        this.commandRunner.returnStatus = true;
        const commandSignal = await this.commandRunner.executeMultipleCommands(this.myDistroCommands(this.currentInstallPathCommandKey));
        this.commandRunner.returnStatus = oldReturnStatusSetting;

        if(commandSignal[0] !== '0') // no dotnet error can be returned, dont want to try to parse this as a path
        {
            return null;
        }

        if(commandResult[0])
        {
            commandResult[0] = commandResult[0].trim();
        }

        if(commandResult[0] && this.resolvePathAsSymlink)
        {
            let symLinkReadCommand = this.myDistroCommands(this.readSymbolicLinkCommandKey);
            symLinkReadCommand = CommandExecutor.replaceSubstringsInCommands(symLinkReadCommand, this.missingPathKey, commandResult[0]);
            const resolvedPath = (await this.commandRunner.executeMultipleCommands(symLinkReadCommand))[0];
            if(resolvedPath)
            {
                return path.dirname(resolvedPath.trim());
            }
        }

        return commandResult[0] ?? null;
    }

    public async dotnetPackageExistsOnSystem(fullySpecifiedDotnetVersion : string, installType : LinuxInstallType) : Promise<boolean>
    {
        let command = this.myDistroCommands(this.packageLookupCommandKey);
        const sdkPackage = await this.myDotnetVersionPackageName(this.JsonDotnetVersion(fullySpecifiedDotnetVersion), installType);
        command = CommandExecutor.replaceSubstringsInCommands(command, this.missingPackageNameKey, sdkPackage);
        const commandResult = (await this.commandRunner.executeMultipleCommands(command))[0];

        const noPackageResult = 'no packages found';
        return commandResult[0].toLowerCase().includes(noPackageResult);
    }

    public getExpectedDotnetDistroFeedInstallationDirectory(): string
    {
        return this.myDistroStrings(this.expectedDistroFeedInstallDirKey);
    }

    public getExpectedDotnetMicrosoftFeedInstallationDirectory(): string
    {
        return this.myDistroStrings(this.expectedMicrosoftFeedInstallDirKey);
    }

    public async upgradeDotnet(versionToUpgrade : string, installType : LinuxInstallType): Promise<string>
    {
        const oldReturnStatusSetting = this.commandRunner.returnStatus;
        this.commandRunner.returnStatus = true;

        let command = this.myDistroCommands(this.updateCommandKey);
        const sdkPackage = await this.myDotnetVersionPackageName(versionToUpgrade, installType);
        command = CommandExecutor.replaceSubstringsInCommands(command, this.missingPackageNameKey, sdkPackage);
        const commandResult = (await this.commandRunner.executeMultipleCommands(command))[0];

        this.commandRunner.returnStatus = oldReturnStatusSetting;
        return commandResult[0];
    }

    public async uninstallDotnet(versionToUninstall : string, installType : LinuxInstallType): Promise<string>
    {
        let command = this.myDistroCommands(this.uninstallCommandKey);
        const sdkPackage = await this.myDotnetVersionPackageName(versionToUninstall, installType);
        command = CommandExecutor.replaceSubstringsInCommands(command, this.missingPackageNameKey, sdkPackage);
        const commandResult = (await this.commandRunner.executeMultipleCommands(command))[0];

        return commandResult[0];
    }

    public async getInstalledDotnetSDKVersions(): Promise<string[]>
    {
        const command = this.myDistroCommands(this.installedSDKVersionsCommandKey);
        const commandResult = (await this.commandRunner.executeMultipleCommands(command))[0];

        const outputLines : string[] = commandResult.split('\n');
        const versions : string[]  = [];

        for(const line of outputLines)
        {
            const splitLine = line.split(/\s+/);
            // list sdk lines shows in the form: version [path], so the version is the 2nd item
            if(splitLine.length === 2)
            {
                versions.push(splitLine[0]);
            }
        }
        return versions;
    }

    public async getInstalledDotnetRuntimeVersions(): Promise<string[]>
    {
        const command = this.myDistroCommands(this.installedRuntimeVersionsCommandKey);
        const commandResult = (await this.commandRunner.executeMultipleCommands(command))[0];

        const outputLines : string[] = commandResult.split('\n');
        const versions : string[]  = [];

        for(const line of outputLines)
        {
            const splitLine = line.split(/\s+/);
            // list runtimes lines shows in the form: runtime version [path], so the version is the 3rd item
            if(splitLine.length === 3)
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
        let commandResult = (await this.commandRunner.executeMultipleCommands(command, { cwd: path.resolve(rootDir), shell: true }))[0];

        commandResult = commandResult.replace('\n', '');
        if(!this.versionResolver.isValidLongFormVersionFormat(commandResult))
        {
            return null;
        }
        {
            return commandResult;
        }
    }

    public async getDotnetVersionSupportStatus(fullySpecifiedVersion: string, installType : LinuxInstallType): Promise<DotnetDistroSupportStatus>
    {
        if(this.versionResolver.getFeatureBandFromVersion(fullySpecifiedVersion) !== '1' || Number(this.versionResolver.getMajor(fullySpecifiedVersion)) < 6)
        {
            return Promise.resolve(DotnetDistroSupportStatus.Unsupported);
        }

        if(this.myVersionDetails().hasOwnProperty(this.preinstallCommandKey))
        {
            // If preinstall commands exist ( to add the msft feed ) then it's a microsoft feed.
            return Promise.resolve(DotnetDistroSupportStatus.Microsoft);
        }
        else
        {
            const availableVersions = await this.myVersionPackages(installType, this.isMidFeedInjection);
            const simplifiedVersion = this.JsonDotnetVersion(fullySpecifiedVersion);

            for(const dotnetPackages of availableVersions)
            {
                if(Number(dotnetPackages.version) === Number(simplifiedVersion))
                {
                    return Promise.resolve(DotnetDistroSupportStatus.Distro);
                }
            }
        }

        return Promise.resolve(DotnetDistroSupportStatus.Unknown);
    }

    public async getRecommendedDotnetVersion(installType : LinuxInstallType) : Promise<string>
    {
        let maxVersion = '0';
        const json = await this.myVersionPackages(installType, this.isMidFeedInjection);
        for(const dotnetPackages of json)
        {
            if(Number(dotnetPackages.version) > Number(maxVersion))
            {
                maxVersion = dotnetPackages.version;
            }
        }

        if(maxVersion === '0')
        {
            const err = new DotnetVersionResolutionError(new Error(`No packages for .NET are available.
Please refer to https://learn.microsoft.com/en-us/dotnet/core/install/linux if you'd link to install .NET.`), null);
            this.context.eventStream.post(err);
            throw(err);
        }

        // Most distros support only 100 band .NET versions, so we default to that here.
        return `${this.JsonDotnetVersion(maxVersion)}.1xx`;
    }

    public JsonDotnetVersion(fullySpecifiedDotnetVersion : string) : string
    {
        return this.versionResolver.getMajorMinor(fullySpecifiedDotnetVersion);
    }

    protected isPackageFoundInSearch(resultOfSearchCommand: any, searchCommandExitCode : string): boolean {
        return resultOfSearchCommand.trim() !== '' && searchCommandExitCode === '0';
    }
}
