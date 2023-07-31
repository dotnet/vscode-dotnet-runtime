/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';

import { FileUtilities } from '../Utils/FileUtilities';
import { IGlobalInstaller } from './IGlobalInstaller';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { VersionResolver } from './VersionResolver';
import { DotnetConflictingGlobalWindowsInstallError, DotnetCustomLinuxInstallExistsError, DotnetUnexpectedInstallerOSError } from '../EventStream/EventStreamEvents';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { CommandExecutor } from '../Utils/CommandExecutor';
/* tslint:disable:only-arrow-functions */
/* tslint:disable:no-empty */

/**
 * @remarks
 * This class manages global .NET SDK installations for windows and mac.
 * Both of these OS's have official installers that we can download and run on the machine.
 * Since Linux does not, it is delegated into its own set of classes.
 */
export class WinMacGlobalInstaller extends IGlobalInstaller {

    private installerUrl : string;
    private installingVersion : string;
    protected commandRunner : ICommandExecutor;
    public cleanupInstallFiles = true;

    constructor(context : IAcquisitionWorkerContext, installingVersion : string, installerUrl : string, executor : ICommandExecutor | null = null)
    {
        super(context);
        this.installerUrl = installerUrl
        this.installingVersion = installingVersion;
        this.commandRunner = executor ?? new CommandExecutor();
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
                    Please uninstall this version first if you would like to continue.`));
                this.acquisitionContext.eventStream.post(err);
                throw err;
            }
        }

        const installerFile : string = await this.downloadInstaller(this.installerUrl);
        const installerResult : string = await this.executeInstall(installerFile);

        if(this.cleanupInstallFiles)
        {
            FileUtilities.wipeDirectory(path.dirname(installerFile));
        }

        const validInstallerStatusCodes = ['0', '1641', '3010']; // Ok, Pending Reboot, + Reboot Starting Now
        if(validInstallerStatusCodes.includes(installerResult))
        {
            return '0'; // These statuses are a success, we dont want to throw.
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
        FileUtilities.wipeDirectory(ourInstallerDownloadFolder);
        const installerPath = path.join(ourInstallerDownloadFolder, `${installerUrl.split('/').slice(-1)}`);
        await this.download(installerUrl, installerPath);
        return installerPath;
    }

    /**
     *
     * @returns an empty promise. It will download the file from the url. The url is expected to be a file server that responds with the file directly.
     * We cannot use a simpler download pattern because we need to download and match the installer file exactly as-is from the server as opposed to writing/copying the bits we are given.
     */
    private async download(url : string, dest : string) {
        return new Promise<void>((resolve, reject) => {

            const installerDir = path.dirname(dest);
            if (!fs.existsSync(installerDir)){
                fs.mkdirSync(installerDir);
            }

            // The file has already been downloaded before. Note that a user couldve added a file here. This is part of why we should sign check the file before launch.
            if(fs.existsSync(dest))
            {
                resolve();
            }

            const file = fs.createWriteStream(dest, { flags: 'wx' });

            const request = https.get(url, response => {
                if (response.statusCode === 200)
                {
                    response.pipe(file);
                }
                else
                {
                    file.close();
                    fs.unlink(dest, () => {}); // Delete incomplete file download
                    reject(`Server responded with ${response.statusCode}: ${response.statusMessage}`);
                }
            });

            request.on('error', err =>
            {
                file.close();
                fs.unlink(dest, () => {}); // Delete incomplete file download
                reject(err.message);
            });

            file.on('finish', () =>
            {
                resolve();
            });

            file.on('error', err =>
            {
                file.close();

                if (err.message.includes('EEXIST'))
                {
                    // 2+ concurrent requests to download the installer occurred and ours got to the race last.
                    resolve();
                }
                else
                {
                    fs.unlink(dest, () => {}); // Delete incomplete file download
                    reject(err.message);
                }
            });
        });
    }

    public async getExpectedGlobalSDKPath(specificSDKVersionInstalled : string, installedArch : string) : Promise<string>
    {
        if(os.platform() === 'win32')
        {
            // The program files should always be set, but in the off chance they are wiped, we can try to use the default as backup.
            // Both ia32 and x64 machines will use 'Program Files'
            // We don't anticipate a user would need to install the x86 SDK, and we dont have any routes that support that yet.
            return path.resolve(path.join(process.env.programfiles!, 'dotnet', 'sdk') ?? `C:\\Program Files\\dotnet\\sdk\\`);
        }
        else if(os.platform() === 'darwin')
        {
            if(installedArch !== 'x64')
            {
                return path.resolve(`/usr/local/share/dotnet/sdk`);
            }
            else
            {
                // We only know this to be correct in the ARM scenarios but I decided to assume the default is the same elsewhere.
                return path.resolve(`/usr/local/share/dotnet/x64/dotnet/sdk`);
            }
        }

        const err = new DotnetUnexpectedInstallerOSError(new Error(`The operating system ${os.platform()} is unsupported.`));
        this.acquisitionContext.eventStream.post(err);
        throw err;
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
            const commandResult = await this.commandRunner.execute(`open -W ${path.resolve(installerPath)}`);
            this.commandRunner.returnStatus = false;
            return commandResult[0];
        }
        else
        {
            let command = `${path.resolve(installerPath)}`;
            if(FileUtilities.isElevated())
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
                Number(VersionResolver.getMajorMinor(requestedVersion)) === Number(VersionResolver.getMajorMinor(sdk)) &&
                Number(VersionResolver.getFeatureBandFromVersion(requestedVersion)) === Number(VersionResolver.getFeatureBandFromVersion(sdk)) &&
                Number(VersionResolver.getFeatureBandPatchVersion(requestedVersion)) <= Number(VersionResolver.getFeatureBandPatchVersion(sdk))
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