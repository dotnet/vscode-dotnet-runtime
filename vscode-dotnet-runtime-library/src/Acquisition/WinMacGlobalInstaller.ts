/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileUtilities } from '../Utils/FileUtilities';
import { VersionResolver } from './VersionResolver';
import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { getInstallKeyFromContext } from '../Utils/InstallKeyUtilities';
import { CommandExecutor } from '../Utils/CommandExecutor';
import {
    DotnetAcquisitionAlreadyInstalled,
    DotnetConflictingGlobalWindowsInstallError,
    DotnetFileIntegrityCheckEvent,
    DotnetInstallCancelledByUserError,
    DotnetUnexpectedInstallerOSError,
    EventCancellationError,
    NetInstallerBeginExecutionEvent,
    NetInstallerEndExecutionEvent,
    OSXOpenNotAvailableError,
    SuppressedAcquisitionError
} from '../EventStream/EventStreamEvents';

import { IGlobalInstaller } from './IGlobalInstaller';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IFileUtilities } from '../Utils/IFileUtilities';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { DotnetInstall } from './DotnetInstall';
/* tslint:disable:only-arrow-functions */
/* tslint:disable:no-empty */
/* tslint:disable:no-any */

namespace validationPromptConstants
{
    export const noSignatureMessage = `The .NET install file could not be validated. It may be insecure or too new to verify. Would you like to continue installing .NET and accept the risks?`;
    export const cancelOption = 'Cancel Install';
    export const allowOption = 'Install Anyways';
}

/**
 * @remarks
 * This class manages global .NET SDK installations for windows and mac.
 * Both of these OS's have official installers that we can download and run on the machine.
 * Since Linux does not, it is delegated into its own set of classes.
 */
export class WinMacGlobalInstaller extends IGlobalInstaller {

    private installerUrl : string;
    private installingVersion : string;
    private installerHash : string;
    protected commandRunner : ICommandExecutor;
    public cleanupInstallFiles = true;
    protected versionResolver : VersionResolver;
    public file : IFileUtilities;
    protected webWorker : WebRequestWorker;

    constructor(context : IAcquisitionWorkerContext, utilContext : IUtilityContext, installingVersion : string, installerUrl : string,
        installerHash : string, executor : ICommandExecutor | null = null)
    {
        super(context, utilContext);
        this.installerUrl = installerUrl;
        this.installingVersion = installingVersion;
        this.installerHash = installerHash;
        this.commandRunner = executor ?? new CommandExecutor(context, utilContext);
        this.versionResolver = new VersionResolver(context);
        this.file = new FileUtilities();
        this.webWorker = new WebRequestWorker(context, installerUrl);
    }

    public async installSDK(install : DotnetInstall): Promise<string>
    {
        // Check for conflicting windows installs
        if(os.platform() === 'win32')
        {
            const conflictingVersion = await this.GlobalWindowsInstallWithConflictingVersionAlreadyExists(this.installingVersion);
            if(conflictingVersion !== '')
            {
                if(conflictingVersion === this.installingVersion)
                {
                    // The install already exists, we can just exit with Ok.
                    this.acquisitionContext.eventStream.post(new DotnetAcquisitionAlreadyInstalled(install,
                        (this.acquisitionContext.acquisitionContext && this.acquisitionContext.acquisitionContext.requestingExtensionId)
                        ? this.acquisitionContext.acquisitionContext.requestingExtensionId : null));
                    return '0';
                }
                const err = new DotnetConflictingGlobalWindowsInstallError(new EventCancellationError(`An global install is already on the machine: version ${conflictingVersion}, that conflicts with the requested version.
                    Please uninstall this version first if you would like to continue.
                    If Visual Studio is installed, you may need to use the VS Setup Window to uninstall the SDK component.`), getInstallKeyFromContext(this.acquisitionContext));
                this.acquisitionContext.eventStream.post(err);
                throw err.error;
            }
        }

        const installerFile : string = await this.downloadInstaller(this.installerUrl);
        const canContinue = await this.installerFileHasValidIntegrity(installerFile);
        if(!canContinue)
        {
            const err = new DotnetConflictingGlobalWindowsInstallError(new EventCancellationError(`The integrity of the .NET install file is invalid, or there was no integrity to check and you denied the request to continue with those risks.
We cannot verify .NET is safe to download at this time. Please try again later.`), getInstallKeyFromContext(this.acquisitionContext));
        this.acquisitionContext.eventStream.post(err);
        throw err.error;
        }
        const installerResult : string = await this.executeInstall(installerFile);

        if(this.cleanupInstallFiles)
        {
            this.file.wipeDirectory(path.dirname(installerFile), this.acquisitionContext.eventStream);
        }

        const validInstallerStatusCodes = ['0', '1641', '3010']; // Ok, Pending Reboot, + Reboot Starting Now
        if(validInstallerStatusCodes.includes(installerResult))
        {
            return '0'; // These statuses are a success, we don't want to throw.
        }
        else if(installerResult === '1602')
        {
            // Special code for when user cancels the install
            const err = new DotnetInstallCancelledByUserError(new EventCancellationError(
                `The install of .NET was cancelled by the user. Aborting.`), getInstallKeyFromContext(this.acquisitionContext));
            this.acquisitionContext.eventStream.post(err);
            throw err.error;
        }
        else
        {
            return installerResult;
        }
    }

    /**
     *
     * @param installerUrl the url of the installer to download.
     * @returns the path to the installer which was downloaded into a directory managed by us.
     */
    private async downloadInstaller(installerUrl : string) : Promise<string>
    {
        const ourInstallerDownloadFolder = IGlobalInstaller.getDownloadedInstallFilesFolder();
        this.file.wipeDirectory(ourInstallerDownloadFolder, this.acquisitionContext.eventStream);
        const installerPath = path.join(ourInstallerDownloadFolder, `${installerUrl.split('/').slice(-1)}`);

        const installerDir = path.dirname(installerPath);
        if (!fs.existsSync(installerDir)){
            fs.mkdirSync(installerDir);
        }

        await this.webWorker.downloadFile(installerUrl, installerPath);
        try
        {
            fs.chmodSync(installerPath, 0o744);
        }
        catch(error : any)
        {
            this.acquisitionContext.eventStream.post(new SuppressedAcquisitionError(error, `Failed to chmod +x on ${installerPath}.`));
        }
        return installerPath;
    }

    private async installerFileHasValidIntegrity(installerFile : string) : Promise<boolean>
    {
        const realFileHash = await this.file.getFileHash(installerFile);
        this.acquisitionContext.eventStream.post(new DotnetFileIntegrityCheckEvent(`The hash of the installer file we downloaded is ${realFileHash}`));
        const expectedFileHash = this.installerHash;
        this.acquisitionContext.eventStream.post(new DotnetFileIntegrityCheckEvent(`The valid and expected hash of the installer file is ${expectedFileHash}`));

        if(expectedFileHash === null)
        {
            const yes = validationPromptConstants.allowOption
            const no = validationPromptConstants.cancelOption;
            const message = validationPromptConstants.noSignatureMessage;

            const pick = await this.utilityContext.ui.getModalWarningResponse(message, no, yes);
            const userConsentsToContinue = pick === yes;
            this.acquisitionContext.eventStream.post(new DotnetFileIntegrityCheckEvent(`The valid hash could not be found. The user chose to continue? ${userConsentsToContinue}`));
            return userConsentsToContinue;
        }

        if(realFileHash !== expectedFileHash)
        {
            this.acquisitionContext.eventStream.post(new DotnetFileIntegrityCheckEvent(`The hashes DO NOT match.`));
            return false;
        }
        else
        {
            this.acquisitionContext.eventStream.post(new DotnetFileIntegrityCheckEvent(`This file is valid.`));
            return true;
        }
    }

    public async getExpectedGlobalSDKPath(specificSDKVersionInstalled : string, installedArch : string) : Promise<string>
    {
        if(os.platform() === 'win32')
        {
            // The program files should always be set, but in the off chance they are wiped, we can try to use the default as backup.
            // Both ia32 and x64 machines will use 'Program Files'
            // We don't anticipate a user would need to install the x86 SDK, and we don't have any routes that support that yet.
            return process.env.programfiles ? path.resolve(path.join(process.env.programfiles, 'dotnet', 'dotnet.exe')) : path.resolve(`C:\\Program Files\\dotnet\\dotnet.exe`);
        }
        else if(os.platform() === 'darwin')
        {
            // On an arm machine we would install to /usr/local/share/dotnet/x64/dotnet/sdk` for a 64 bit sdk
            // but we don't currently allow customizing the install architecture so that would never happen.
            return path.resolve(`/usr/local/share/dotnet/dotnet`);
        }

        const err = new DotnetUnexpectedInstallerOSError(new Error(`The operating system ${os.platform()} is unsupported.`), getInstallKeyFromContext(this.acquisitionContext));
        this.acquisitionContext.eventStream.post(err);
        throw err.error;
    }

    /**
     *
     * @param installerPath The path to the installer file to run.
     * @returns The exit result from running the global install.
     */
    public async executeInstall(installerPath : string) : Promise<string>
    {
        this.commandRunner.returnStatus = true;
        if(os.platform() === 'darwin')
        {
            // For Mac:
            // We don't rely on the installer because it doesn't allow us to run without sudo, and we don't want to handle the user password.
            // The -W flag makes it so we wait for the installer .pkg to exit, though we are unable to get the exit code.
            const possibleCommands =
            [
                CommandExecutor.makeCommand(`command`, [`-v`, `open`]),
                CommandExecutor.makeCommand(`/usr/bin/open`, [])
            ];

            let workingCommand = await this.commandRunner.tryFindWorkingCommand(possibleCommands);
            if(!workingCommand)
            {
                const error = new Error(`The 'open' command on OSX was not detected. This is likely due to the PATH environment variable on your system being clobbered by another program.
Please correct your PATH variable or make sure the 'open' utility is installed so .NET can properly execute.`);
                this.acquisitionContext.eventStream.post(new OSXOpenNotAvailableError(error, getInstallKeyFromContext(this.acquisitionContext)));
                throw error;
            }
            else if(workingCommand.commandRoot === 'command')
            {
                workingCommand = CommandExecutor.makeCommand(`open`, [`-W`, `${path.resolve(installerPath)}`]);
            }

            this.acquisitionContext.eventStream.post(new NetInstallerBeginExecutionEvent(`The OS X .NET Installer has been launched.`));
            const commandResult = await this.commandRunner.execute(
                workingCommand
            );
            this.acquisitionContext.eventStream.post(new NetInstallerEndExecutionEvent(`The OS X .NET Installer has closed.`));

            this.commandRunner.returnStatus = false;
            return commandResult;
        }
        else
        {
            const command = `${path.resolve(installerPath)}`;
            let commandOptions : string[] = [];
            if(this.file.isElevated(this.acquisitionContext.eventStream))
            {
                commandOptions = [`/quiet`, `/install`, `/norestart`];
            }

            this.acquisitionContext.eventStream.post(new NetInstallerBeginExecutionEvent(`The Windows .NET Installer has been launched.`));
            const commandResult = await this.commandRunner.execute(
                CommandExecutor.makeCommand(command, commandOptions)
            );
            this.acquisitionContext.eventStream.post(new NetInstallerEndExecutionEvent(`The Windows .NET Installer has closed.`));

            this.commandRunner.returnStatus = false;
            return commandResult;
        }
    }

    /**
     *
     * @param registryQueryResult the raw output of a registry query converted into a string
     * @returns
     */
    private extractVersionsOutOfRegistryKeyStrings(registryQueryResult : string) : string[]
    {
        if(registryQueryResult === '')
        {
                return [];
        }
        else
        {
            return registryQueryResult.split(' ')
            .filter
            (
                function(value : string, i : number) { return value !== '' && i !== 0; } // Filter out the whitespace & query as the query return value starts with the query.
            )
            .filter
            (
                function(value : string, i : number) { return i % 3 === 0; } // Every 0th, 4th, etc item will be a value name AKA the SDK version. The rest will be REGTYPE and REGHEXVALUE.
            );
        }
    }

    /**
     *
     * @returns Returns '' if no conflicting version was found on the machine.
     * Returns the existing version if a global install with the requested version already exists.
     * OR: If a global install exists for the same band with a higher version.
     * For non-windows cases: In Mac the installer is always shown so that will show users this. For Linux, it's handled by the distro specific code.
     */
    public async GlobalWindowsInstallWithConflictingVersionAlreadyExists(requestedVersion : string) : Promise<string>
    {
        // Note that we could be more intelligent here and consider only if the SDKs conflict within an architecture, but for now we won't do this.
        const sdks : Array<string> = await this.getGlobalSdkVersionsInstalledOnMachine();
        for (const sdk of sdks)
        {
            if
            ( // Side by side installs of the same major.minor and band can cause issues in some cases. So we decided to just not allow it unless upgrading to a newer patch version.
              // The installer can catch this but we can avoid unnecessary work this way,
              // and for windows the installer may never appear to the user. With this approach, we don't need to handle installer error codes.
                Number(this.versionResolver.getMajorMinor(requestedVersion)) === Number(this.versionResolver.getMajorMinor(sdk)) &&
                Number(this.versionResolver.getFeatureBandFromVersion(requestedVersion)) === Number(this.versionResolver.getFeatureBandFromVersion(sdk)) &&
                Number(this.versionResolver.getFeatureBandPatchVersion(requestedVersion)) <= Number(this.versionResolver.getFeatureBandPatchVersion(sdk))
            )
            {
                return sdk;
            }
        }

        return '';
    }

    /**
     *
     * @returns an array containing fully specified / specific versions of all globally installed sdks on the machine in windows for 32 and 64 bit sdks.
     */
    public async getGlobalSdkVersionsInstalledOnMachine() : Promise<Array<string>>
    {
        let sdks: string[] = [];


        if (os.platform() === 'win32')
        {
            const sdkInstallRecords64Bit = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x64\\sdk';
            const sdkInstallRecords32Bit = sdkInstallRecords64Bit.replace('x64', 'x86');

            const queries = [sdkInstallRecords32Bit, sdkInstallRecords64Bit];
            for ( const query of queries)
            {
                try
                {
                    const registryQueryCommand = path.join(`${process.env.SystemRoot}`, `System32\\reg.exe`);
                    // /reg:32 is added because all keys on 64 bit machines are all put into the WOW node. They won't be on the WOW node on a 32 bit machine.
                    const command = CommandExecutor.makeCommand(registryQueryCommand, [`query`, `${query}`, `\/reg:32`]);

                    let installRecordKeysOfXBit = '';
                    const oldReturnStatusSetting = this.commandRunner.returnStatus;
                    this.commandRunner.returnStatus = true;
                    const registryLookupStatusCode = await this.commandRunner.execute(command);
                    this.commandRunner.returnStatus = oldReturnStatusSetting;

                    if(registryLookupStatusCode === '0')
                    {
                        installRecordKeysOfXBit = await this.commandRunner.execute(command);
                    }

                    const installedSdks = this.extractVersionsOutOfRegistryKeyStrings(installRecordKeysOfXBit);
                    // Append any newly found sdk versions
                    sdks = sdks.concat(installedSdks.filter((item) => sdks.indexOf(item) < 0));
                }
                catch(e)
                {
                    // There are no "X" bit sdks on the machine.
                }
            }
        }

        return sdks;
    }
}