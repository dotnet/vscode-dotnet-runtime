/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import
{
    DotnetAcquisitionAlreadyInstalled,
    DotnetConflictingGlobalWindowsInstallError,
    DotnetFileIntegrityCheckEvent,
    DotnetFileIntegrityFailureEvent,
    DotnetInstallCancelledByUserError,
    DotnetNoInstallerResponseError,
    DotnetUnexpectedInstallerOSError,
    EventBasedError,
    EventCancellationError,
    NetInstallerBeginExecutionEvent,
    NetInstallerEndExecutionEvent,
    OSXOpenNotAvailableError,
    SuppressedAcquisitionError
} from '../EventStream/EventStreamEvents';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { FileUtilities } from '../Utils/FileUtilities';
import { getInstallFromContext } from '../Utils/InstallIdUtilities';
import { WebRequestWorkerSingleton } from '../Utils/WebRequestWorkerSingleton';
import { VersionResolver } from './VersionResolver';
import * as versionUtils from './VersionUtilities';

import { CommandExecutorResult } from '../Utils/CommandExecutorResult';
import { ICommandExecutor } from '../Utils/ICommandExecutor';
import { IFileUtilities } from '../Utils/IFileUtilities';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { executeWithLock, getOSArch } from '../Utils/TypescriptUtilities';
import { GLOBAL_LOCK_PING_DURATION_MS, SYSTEM_INFORMATION_CACHE_DURATION_MS } from './CacheTimeConstants';
import { DotnetInstall } from './DotnetInstall';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IGlobalInstaller } from './IGlobalInstaller';
import { IRegistryReader } from './IRegistryReader';
import { RegistryReader } from './RegistryReader';
import { GLOBAL_INSTALL_STATE_MODIFIER_LOCK, UNABLE_TO_ACQUIRE_GLOBAL_LOCK_ERR } from './StringConstants';

namespace validationPromptConstants
{
    export const noSignatureMessage = `The .NET Installer file could not be validated. It may be insecure or too new to verify. Would you like to continue installing .NET and accept the risks?`;
    export const cancelOption = 'Cancel Install';
    export const allowOption = 'Install Anyways';
}

/**
 * @remarks
 * This class manages global .NET SDK installations for windows and mac.
 * Both of these OS's have official installers that we can download and run on the machine.
 * Since Linux does not, it is delegated into its own set of classes.
 */
export class WinMacGlobalInstaller extends IGlobalInstaller
{

    private installerUrl: string;
    private installingVersion: string;
    private installerHash: string;
    protected commandRunner: ICommandExecutor;
    protected registry: IRegistryReader;
    public cleanupInstallFiles = true;
    protected versionResolver: VersionResolver;
    public file: IFileUtilities;
    protected webWorker: WebRequestWorkerSingleton;
    private invalidIntegrityError = `The integrity of the .NET install file is invalid, or there was no integrity to check and you denied the request to continue with those risks.
We cannot verify our .NET file host at this time. Please try again later or install the SDK manually.`;

    constructor(context: IAcquisitionWorkerContext, utilContext: IUtilityContext, installingVersion: string, installerUrl: string,
        installerHash: string, executor: ICommandExecutor | null = null, registryReader: IRegistryReader | null = null)
    {
        super(context, utilContext);
        this.installerUrl = installerUrl;
        this.installingVersion = installingVersion;
        this.installerHash = installerHash;
        this.commandRunner = executor ?? new CommandExecutor(context, utilContext);
        this.versionResolver = new VersionResolver(context);
        this.file = new FileUtilities();
        this.webWorker = WebRequestWorkerSingleton.getInstance();
        this.registry = registryReader ?? new RegistryReader(context, utilContext);
    }

    public static InterpretExitCode(code: string): string
    {
        const reportLogMessage = `Please provide your .NET Installer log (note our privacy notice), which can be found at %temp%.
The file has a name like 'Microsoft_.NET_SDK*.log and should appear in recent files.
This report should be made at https://github.com/dotnet/vscode-dotnet-runtime/issues.`

        switch (code)
        {
            case '1':
                return `The .NET SDK installer has failed with a generic failure. ${reportLogMessage}`;
            case '5':
                return `Insufficient permissions are available to install .NET. Please run the installer as an administrator.`;
            case '67':
                return `The network name cannot be found. ${reportLogMessage}`;
            case '112':
                return `The disk is full. Please free up space and try again.`;
            case '255':
                return `The .NET Installer was terminated by another process unexpectedly. Please try again.`;
            case '1260':
                return `The .NET SDK is blocked by group policy. Can you please report this at https://github.com/dotnet/vscode-dotnet-runtime/issues`
            case '1460':
                return `The .NET SDK had a timeout error. ${reportLogMessage}`;
            case '1603':
                return `Fatal error during .NET SDK installation. ${reportLogMessage}`;
            case '1618':
                return `Another installation is already in progress. Complete that installation before proceeding with this install.`;
            case '000751':
                return `Page fault was satisfied by reading from a secondary storage device. ${reportLogMessage}`;
            case '2147500037':
                return `An unspecified error occurred. ${reportLogMessage}`;
            case '2147942405':
                return `Insufficient permissions are available to install .NET. Please try again as an administrator.`;
            case UNABLE_TO_ACQUIRE_GLOBAL_LOCK_ERR:
                return `Could not acquire global lock to edit machine state. Was another operation in progress? Try restarting VS Code.`
        }
        return '';
    }

    public async installSDK(installation: DotnetInstall): Promise<string>
    {
        return executeWithLock(this.acquisitionContext.eventStream, false, GLOBAL_INSTALL_STATE_MODIFIER_LOCK(this.acquisitionContext.installDirectoryProvider, installation), GLOBAL_LOCK_PING_DURATION_MS, this.acquisitionContext.timeoutSeconds * 1000,
            async (install: DotnetInstall) =>
            {
                // Check for conflicting windows installs
                if (os.platform() === 'win32')
                {
                    const conflictingVersion = await this.GlobalWindowsInstallWithConflictingVersionAlreadyExists(this.installingVersion);
                    if (conflictingVersion !== '')
                    {
                        if (conflictingVersion === this.installingVersion)
                        {
                            // The install already exists, we can just exit with Ok.
                            this.acquisitionContext.eventStream.post(new DotnetAcquisitionAlreadyInstalled(install,
                                (this.acquisitionContext.acquisitionContext && this.acquisitionContext.acquisitionContext.requestingExtensionId)
                                    ? this.acquisitionContext.acquisitionContext.requestingExtensionId : null));
                            return '0';
                        }
                        const err = new DotnetConflictingGlobalWindowsInstallError(new EventCancellationError(
                            'DotnetConflictingGlobalWindowsInstallError',
                            `A global install is already on the machine: version ${conflictingVersion}, that conflicts with the requested version.
                    Please uninstall this version first if you would like to continue.
                    If Visual Studio is installed, you may need to use the VS Setup Window to uninstall the SDK component.`), install);
                        this.acquisitionContext.eventStream.post(err);
                        throw err.error;
                    }
                }

                const installerFile: string = await this.downloadInstaller(this.installerUrl);
                const canContinue = await this.installerFileHasValidIntegrity(installerFile);
                if (!canContinue)
                {
                    const err = new DotnetConflictingGlobalWindowsInstallError(new EventCancellationError('DotnetConflictingGlobalWindowsInstallError',
                        this.invalidIntegrityError), install);
                    this.acquisitionContext.eventStream.post(err);
                    throw err.error;
                }
                const installerResult: string = await this.executeInstall(installerFile);

                return this.handleStatus(installerResult, installerFile, install);
            }, installation);
    }

    private async handleStatus(installerResult: string, installerFile: string, install: DotnetInstall, allowRetry = true): Promise<string>
    {
        const validInstallerStatusCodes = ['0', '1641', '3010']; // Ok, Pending Reboot, + Reboot Starting Now
        const noPermissionStatusCodes = ['1', '5', '1260', '2147942405'];

        if (validInstallerStatusCodes.includes(installerResult))
        {
            if (this.cleanupInstallFiles)
            {
                await this.file.wipeDirectory(path.dirname(installerFile), this.acquisitionContext.eventStream);
            }
            return '0'; // These statuses are a success, we don't want to throw.
        }
        else if (installerResult === '1602')
        {
            // Special code for when user cancels the install
            const err = new DotnetInstallCancelledByUserError(new EventCancellationError('DotnetInstallCancelledByUserError',
                `The install of .NET was cancelled by the user. Aborting.`), install);
            this.acquisitionContext.eventStream.post(err);
            throw err.error;
        }
        else if (noPermissionStatusCodes.includes(installerResult) && allowRetry)
        {
            const retryWithElevationResult = await this.executeInstall(installerFile, true);
            return this.handleStatus(retryWithElevationResult, installerFile, install, false);
        }
        else
        {
            return installerResult;
        }
    }

    public async uninstallSDK(installation: DotnetInstall): Promise<string>
    {
        if (os.platform() === 'win32')
        {
            const installerFile: string = await this.downloadInstaller(this.installerUrl);
            const canContinue = await this.installerFileHasValidIntegrity(installerFile);
            if (!canContinue)
            {
                const err = new DotnetConflictingGlobalWindowsInstallError(new EventCancellationError('DotnetConflictingGlobalWindowsInstallError',
                    this.invalidIntegrityError), installation);
                this.acquisitionContext.eventStream.post(err);
                throw err.error;
            }

            const command = `${path.resolve(installerFile)}`;
            const uninstallArgs = ['/uninstall', '/passive', '/norestart'];
            const commandResult = await this.commandRunner.execute(CommandExecutor.makeCommand(command, uninstallArgs), { timeout: this.acquisitionContext.timeoutSeconds * 1000 }, false);
            this.handleTimeout(commandResult);

            return commandResult.status;
        }
        else
        {
            const macPath = await this.getMacPath();
            const command = CommandExecutor.makeCommand(`rm`, [`-rf`, `${path.join(path.dirname(macPath), 'sdk', installation.version)}`, `&&`,
                `rm`, `-rf`, `${path.join(path.dirname(macPath), 'sdk-manifests', installation.version)}`], true);

            const commandResult = await this.commandRunner.execute(command, { timeout: this.acquisitionContext.timeoutSeconds * 1000 }, false);
            this.handleTimeout(commandResult);

            return commandResult.status;
        }
    }

    /**
     *
     * @param installerUrl the url of the installer to download.
     * @returns the path to the installer which was downloaded into a directory managed by us.
     */
    private async downloadInstaller(installerUrl: string): Promise<string>
    {
        const ourInstallerDownloadFolder = IGlobalInstaller.getDownloadedInstallFilesFolder(installerUrl);
        const installerPath = path.join(ourInstallerDownloadFolder, `${installerUrl.split('/').slice(-1)}`);

        if (await this.file.exists(installerPath) && await this.installerFileHasValidIntegrity(installerPath, false))
        {
            this.acquisitionContext.eventStream.post(new DotnetFileIntegrityCheckEvent(`The installer file ${installerPath} already exists and is valid.`));
            return installerPath;
        }

        await this.file.wipeDirectory(ourInstallerDownloadFolder, this.acquisitionContext.eventStream);

        const installerDir = path.dirname(installerPath);
        if (!(await this.file.exists(installerDir)))
        {
            await fs.promises.mkdir(installerDir, { recursive: true });
        }

        await this.webWorker.downloadFile(installerUrl, installerPath, this.acquisitionContext);
        try
        {
            if (os.platform() === 'win32') // Windows does not have chmod +x ability with nodejs.
            {
                const permissionsCommand = CommandExecutor.makeCommand('icacls', [`"${installerPath}"`, '/grant:r', `"%username%":F`, '/t', '/c']);
                const commandRes = await this.commandRunner.execute(permissionsCommand, {}, false);
                if (commandRes.stderr !== '')
                {
                    const error = new EventBasedError('FailedToSetInstallerPermissions', `Failed to set icacls permissions on the installer file ${installerPath}. ${commandRes.stderr}`);
                    this.acquisitionContext.eventStream.post(new SuppressedAcquisitionError(error, error.message));
                }
            }
            else
            {
                await fs.promises.chmod(installerPath, 0o744);
            }
        }
        catch (error: any)
        {
            this.acquisitionContext.eventStream.post(new SuppressedAcquisitionError(error, `Failed to chmod +x on ${installerPath}.`));
        }
        return installerPath;
    }

    private async userChoosesToContinueWithInvalidHash(): Promise<boolean>
    {
        const yes = validationPromptConstants.allowOption;
        const no = validationPromptConstants.cancelOption;
        const message = validationPromptConstants.noSignatureMessage;

        const pick = await this.utilityContext.ui.getModalWarningResponse(message, no, yes);
        const userConsentsToContinue = pick === yes;
        this.acquisitionContext.eventStream.post(new DotnetFileIntegrityCheckEvent(`The valid hash could not be found. The user chose to continue? ${userConsentsToContinue}`));
        return userConsentsToContinue;
    }

    private async installerFileHasValidIntegrity(installerFile: string, ask = false): Promise<boolean>
    {
        try
        {
            const realFileHash = await this.file.getFileHash(installerFile);

            this.acquisitionContext.eventStream.post(new DotnetFileIntegrityCheckEvent(`The hash of the installer file we downloaded is ${realFileHash}`));
            const expectedFileHash = this.installerHash;
            this.acquisitionContext.eventStream.post(new DotnetFileIntegrityCheckEvent(`The valid and expected hash of the installer file is ${expectedFileHash}`));

            if (expectedFileHash === null)
            {
                return ask ? await this.userChoosesToContinueWithInvalidHash() : false;
            }

            if (realFileHash !== expectedFileHash)
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
        catch (error: any)
        {
            // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (error?.message?.includes('ENOENT'))
            {
                this.acquisitionContext.eventStream.post(new DotnetFileIntegrityFailureEvent(`The file ${installerFile} was not found, so we couldn't verify it.
Please try again, or download the .NET Installer file yourself. You may also report your issue at https://github.com/dotnet/vscode-dotnet-runtime/issues.`));
            }
            // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            else if (error?.message?.includes('EPERM'))
            {
                this.acquisitionContext.eventStream.post(new DotnetFileIntegrityFailureEvent(`The file ${installerFile} did not have the correct permissions scope to be assessed.
Permissions: ${JSON.stringify(await this.commandRunner.execute(CommandExecutor.makeCommand('icacls', [`"${installerFile}"`]), { dotnetInstallToolCacheTtlMs: SYSTEM_INFORMATION_CACHE_DURATION_MS }, false))}`));
            }
            return ask ? this.userChoosesToContinueWithInvalidHash() : false;
        }
    }

    // async is needed to match the interface even if we don't use await.
    // eslint-disable-next-line @typescript-eslint/require-await
    public async getExpectedGlobalSDKPath(specificSDKVersionInstalled: string, installedArch: string, macPathShouldExist = true): Promise<string>
    {
        if (os.platform() === 'win32')
        {
            // The program files should always be set, but in the off chance they are wiped, we can try to use the default as backup.
            // Both ia32 and x64 machines will use 'Program Files'
            if (process.env.programfiles)
            {
                if (os.arch() === 'arm64' && installedArch === 'x64')
                {
                    return path.resolve(path.join(process.env.programfiles, 'dotnet', 'x64', 'dotnet.exe'));
                }
                return path.resolve(path.join(process.env.programfiles, 'dotnet', 'dotnet.exe'))
            }

            if (os.arch() === 'arm64' && installedArch === 'x64')
            {
                return path.resolve(`C:\\Program Files\\dotnet\\x64\\dotnet.exe`);
            }
            return path.resolve(`C:\\Program Files\\dotnet\\dotnet.exe`);
        }
        else if (os.platform() === 'darwin')
        {
            const sdkPath = await this.getMacPath(macPathShouldExist);
            return sdkPath;
        }

        const err = new DotnetUnexpectedInstallerOSError(new EventBasedError('DotnetUnexpectedInstallerOSError',
            `The operating system ${os.platform()} is unsupported.`), getInstallFromContext(this.acquisitionContext));
        this.acquisitionContext.eventStream.post(err);
        throw err.error;
    }

    private handleTimeout(commandResult: CommandExecutorResult)
    {
        if (commandResult.status === 'SIGTERM')
        {
            const noResponseError = new DotnetNoInstallerResponseError(new EventBasedError('DotnetNoInstallerResponseError',
                `The .NET Installer did not complete after ${this.acquisitionContext.timeoutSeconds} seconds.
If you would like to install .NET, please proceed to interact with the .NET Installer pop-up.
If you were waiting for the install to succeed, please extend the timeout setting of the .NET Install Tool extension.`), getInstallFromContext(this.acquisitionContext));
            this.acquisitionContext.eventStream.post(noResponseError);
            throw noResponseError.error;
        }
    }

    private async getMacPath(macPathShouldExist = true): Promise<string>
    {
        const standardHostPath = path.resolve(`/usr/local/share/dotnet/dotnet`);
        const arm64EmulationHostPath = path.resolve(`/usr/local/share/dotnet/x64/dotnet`);

        if ((os.arch() === 'x64' || os.arch() === 'ia32') && (await getOSArch(this.commandRunner)).includes('arm') && (await this.file.exists(arm64EmulationHostPath) || !macPathShouldExist))
        {
            // VS Code runs on an emulated version of node which will return x64 or use x86 emulation for ARM devices.
            // os.arch() returns the architecture of the node binary, not the system architecture, so it will not report arm on an arm device.
            return arm64EmulationHostPath;
        }

        if (!macPathShouldExist || (await this.file.exists(standardHostPath)) || !(await this.file.exists(arm64EmulationHostPath)))
        {
            return standardHostPath;
        }
        return arm64EmulationHostPath;
    }

    /**
     *
     * @param installerPath The path to the installer file to run.
     * @returns The exit result from running the global install.
     */
    public async executeInstall(installerPath: string, elevateVsCode = false): Promise<string>
    {
        if (os.platform() === 'darwin')
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
            if (!workingCommand)
            {
                const error = new EventBasedError('OSXOpenNotAvailableError',
                    `The 'open' command on OSX was not detected. This is likely due to the PATH environment variable on your system being clobbered by another program.
Please correct your PATH variable or make sure the 'open' utility is installed so .NET can properly execute.`);
                this.acquisitionContext.eventStream.post(new OSXOpenNotAvailableError(error, getInstallFromContext(this.acquisitionContext)));
                throw error;
            }
            else if (workingCommand.commandRoot === 'command')
            {
                workingCommand = CommandExecutor.makeCommand(`open`, [`-W`, `"${path.resolve(installerPath)}"`]);
            }

            this.acquisitionContext.eventStream.post(new NetInstallerBeginExecutionEvent(`The OS X .NET Installer has been launched.`));

            const commandResult = await this.commandRunner.execute(workingCommand, { timeout: this.acquisitionContext.timeoutSeconds * 1000 }, false);

            this.acquisitionContext.eventStream.post(new NetInstallerEndExecutionEvent(`The OS X .NET Installer has closed.`));
            this.handleTimeout(commandResult);

            return commandResult.status;
        }
        else
        {
            const command = `"${path.resolve(installerPath)}"`;
            let commandOptions: string[] = [];
            if (await this.file.isElevated(this.acquisitionContext, this.utilityContext))
            {
                commandOptions = [`/quiet`, `/install`, `/norestart`];
            }
            else
            {
                commandOptions = [`/passive`, `/install`, `/norestart`]
            }

            this.acquisitionContext.eventStream.post(new NetInstallerBeginExecutionEvent(`The Windows .NET Installer has been launched.`));
            try
            {
                const commandResult = await this.commandRunner.execute(CommandExecutor.makeCommand(command, commandOptions, elevateVsCode), { timeout: this.acquisitionContext.timeoutSeconds * 1000 }, false);
                this.handleTimeout(commandResult);
                this.acquisitionContext.eventStream.post(new NetInstallerEndExecutionEvent(`The Windows .NET Installer has closed.`));
                return commandResult.status;
            }
            catch (error: any)
            {
                // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                if ((error?.message as string)?.includes('EPERM'))
                {
                    // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    error.message = `The installer does not have permission to execute. Please try running as an administrator. ${error?.message}.
Permissions: ${JSON.stringify(await this.commandRunner.execute(CommandExecutor.makeCommand('icacls', [`"${installerPath}"`]), { dotnetInstallToolCacheTtlMs: SYSTEM_INFORMATION_CACHE_DURATION_MS }, false))}`;
                }
                // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                else if ((error?.message as string)?.includes('ENOENT'))
                {
                    // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    error.message = `The .NET Installation files were not found. Please try again. ${error?.message}`;
                }
                throw error;
            }
        }
    }

    /**
     *
     * @returns Returns '' if no conflicting version was found on the machine.
     * Returns the existing version if a global install with the requested version already exists.
     * OR: If a global install exists for the same band with a higher version.
     * For non-windows cases: In Mac the installer is always shown so that will show users this. For Linux, it's handled by the distro specific code.
     */
    public async GlobalWindowsInstallWithConflictingVersionAlreadyExists(requestedVersion: string): Promise<string>
    {
        // Note that we could be more intelligent here and consider only if the SDKs conflict within an architecture, but for now we won't do this.
        const sdks: Array<string> = await this.registry.getGlobalSdkVersionsInstalledOnMachine();
        for (const sdk of sdks)
        {
            if
                ( // Side by side installs of the same major.minor and band can cause issues in some cases. So we decided to just not allow it unless upgrading to a newer patch version.
                // The installer can catch this but we can avoid unnecessary work this way,
                // and for windows the installer may never appear to the user. With this approach, we don't need to handle installer error codes.
                Number(versionUtils.getMajorMinor(requestedVersion, this.acquisitionContext.eventStream, this.acquisitionContext)) ===
                Number(versionUtils.getMajorMinor(sdk, this.acquisitionContext.eventStream, this.acquisitionContext)) &&
                Number(versionUtils.getFeatureBandFromVersion(requestedVersion, this.acquisitionContext.eventStream, this.acquisitionContext)) ===
                Number(versionUtils.getFeatureBandFromVersion(sdk, this.acquisitionContext.eventStream, this.acquisitionContext)) &&
                Number(versionUtils.getFeatureBandPatchVersion(requestedVersion, this.acquisitionContext.eventStream, this.acquisitionContext)) <=
                Number(versionUtils.getFeatureBandPatchVersion(sdk, this.acquisitionContext.eventStream, this.acquisitionContext))
            )
            {
                return sdk;
            }
        }

        return '';
    }
}