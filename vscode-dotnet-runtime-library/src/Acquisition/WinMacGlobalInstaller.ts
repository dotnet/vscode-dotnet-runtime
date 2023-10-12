/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import * as vscode from 'vscode';

import { FileUtilities } from '../Utils/FileUtilities';
import { IGlobalInstaller } from './IGlobalInstaller';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { VersionResolver } from './VersionResolver';
import { DotnetAcquisitionDistroUnknownError, DotnetAcquisitionError, DotnetConflictingGlobalWindowsInstallError, DotnetUnexpectedInstallerOSError, OSXOpenNotAvailableError } from '../EventStream/EventStreamEvents';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { CommandExecutor } from '../Utils/CommandExecutor';
import exp = require('constants');
import { expect } from 'chai';
import { IFileUtilities } from '../Utils/IFileUtilities';
import { WebRequestWorker } from '../Utils/WebRequestWorker';
/* tslint:disable:only-arrow-functions */
/* tslint:disable:no-empty */

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

    constructor(context : IAcquisitionWorkerContext, installingVersion : string, installerUrl : string, installerHash : string, executor : ICommandExecutor | null = null)
    {
        super(context);
        this.installerUrl = installerUrl;
        this.installingVersion = installingVersion;
        this.installerHash = installerHash;
        this.commandRunner = executor ?? new CommandExecutor(context.eventStream);
        this.versionResolver = new VersionResolver(context.extensionState, context.eventStream, context.timeoutValue, context.proxyUrl);
        this.file = new FileUtilities();
        this.webWorker = new WebRequestWorker(context.extensionState, context.eventStream,
            installerUrl, this.acquisitionContext.timeoutValue, this.acquisitionContext.proxyUrl);
    }

    public async installSDK(): Promise<string>
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
                    return '0';
                }
                const err = new DotnetConflictingGlobalWindowsInstallError(new Error(`An global install is already on the machine: version ${conflictingVersion}, that conflicts with the requested version.
                    Please uninstall this version first if you would like to continue.
                    If Visual Studio is installed, you may need to use the VS Setup Window to uninstall the SDK component.`));
                this.acquisitionContext.eventStream.post(err);
                throw err.error;
            }
        }

        const installerFile : string = await this.downloadInstaller(this.installerUrl);
        const canContinue = await this.installerFileHasValidIntegrity(installerFile);
        if(!canContinue)
        {
            const err = new DotnetConflictingGlobalWindowsInstallError(new Error(`The integrity of the .NET install file is invalid, or there was no integrity to check and you denied the request to continue with those risks.
We cannot verify .NET is safe to download at this time. Please try again later.`));
        this.acquisitionContext.eventStream.post(err);
        throw err.error;
        }
        const installerResult : string = await this.executeInstall(installerFile);

        if(this.cleanupInstallFiles)
        {
            this.file.wipeDirectory(path.dirname(installerFile));
        }

        const validInstallerStatusCodes = ['0', '1641', '3010']; // Ok, Pending Reboot, + Reboot Starting Now
        if(validInstallerStatusCodes.includes(installerResult))
        {
            return '0'; // These statuses are a success, we don't want to throw.
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
        this.file.wipeDirectory(ourInstallerDownloadFolder);
        const installerPath = path.join(ourInstallerDownloadFolder, `${installerUrl.split('/').slice(-1)}`);

        const installerDir = path.dirname(installerPath);
        if (!fs.existsSync(installerDir)){
            fs.mkdirSync(installerDir);
        }

        await this.webWorker.downloadFile(installerUrl, installerPath);
        return installerPath;
    }

    private async installerFileHasValidIntegrity(installerFile : string) : Promise<boolean>
    {
        const realFileHash = await this.file.getFileHash(installerFile);
        const expectedFileHash = this.installerHash;

        if(expectedFileHash === null)
        {
            const yes = validationPromptConstants.allowOption
            const no = validationPromptConstants.cancelOption;
            const message = validationPromptConstants.noSignatureMessage;

            const pick = await vscode.window.showWarningMessage(message, { modal: true }, no, yes);
            const userConsentsToContinue = pick === yes;
            return userConsentsToContinue;
        }

        if(realFileHash !== expectedFileHash)
        {
            return false;
        }
        else
        {
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
            return process.env.programfiles ? path.resolve(path.join(process.env.programfiles, 'dotnet', 'sdk')) : path.resolve(`C:\\Program Files\\dotnet\\sdk\\`);
        }
        else if(os.platform() === 'darwin')
        {
            // On an arm machine we would install to /usr/local/share/dotnet/x64/dotnet/sdk` for a 64 bit sdk
            // but we don't currently allow customizing the install architecture so that would never happen.
            return path.resolve(`/usr/local/share/dotnet/sdk`);
        }

        const err = new DotnetUnexpectedInstallerOSError(new Error(`The operating system ${os.platform()} is unsupported.`));
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
            let commandToExecute = `open`

            const openAvailable = await this.commandRunner.TryFindWorkingCommand([`command -v open`, `/usr/bin/open`]);
            if(openAvailable[1] && openAvailable[0] !== 'command -v open')
            {
                commandToExecute = openAvailable[0];
            }
            else if(!openAvailable[1])
            {
                const error = new Error(`The 'open' command on OSX was not detected. This is likely due to the PATH environment variable on your system being clobbered by another program.
Please correct your PATH variable or make sure the 'open' utility is installed so .NET can properly execute.`);
                this.acquisitionContext.eventStream.post(new OSXOpenNotAvailableError(error));
                throw error;
            }

            const commandResult = await this.commandRunner.execute(`${commandToExecute} -W ${path.resolve(installerPath)}`);
            this.commandRunner.returnStatus = false;
            return commandResult[0];
        }
        else
        {
            let command = `${path.resolve(installerPath)}`;
            if(this.file.isElevated(this.acquisitionContext.eventStream))
            {
                command += ' /quiet /install /norestart';
            }
            const commandResult = await this.commandRunner.execute(command);
            this.commandRunner.returnStatus = false;
            return commandResult[0];
        }
    }

    /**
     *
     * @param registryQueryResult the raw output of a registry query converted into a string
     * @returns
     */
    private extractVersionsOutOfRegistryKeyStrings(registryQueryResult : string) : string[]
    {
        if(registryQueryResult.includes('ERROR') || registryQueryResult === '')
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
                    const fullQuery = `${registryQueryCommand} query ${query} \/reg:32`;
                    const installRecordKeysOfXBit = (await this.commandRunner.execute(fullQuery))[0];
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