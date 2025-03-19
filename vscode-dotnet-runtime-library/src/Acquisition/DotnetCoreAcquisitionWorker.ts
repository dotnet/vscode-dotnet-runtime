/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');

import
{
    DotnetAcquisitionAlreadyInstalled,
    DotnetAcquisitionCompleted,
    DotnetAcquisitionDeletion,
    DotnetAcquisitionPartialInstallation,
    DotnetAcquisitionStarted,
    DotnetAcquisitionStatusResolved,
    DotnetAcquisitionStatusUndefined,
    DotnetBeginGlobalInstallerExecution,
    DotnetCompletedGlobalInstallerExecution,
    DotnetFakeSDKEnvironmentVariableTriggered,
    DotnetGlobalAcquisitionCompletionEvent,
    DotnetGlobalVersionResolutionCompletionEvent,
    DotnetInstallGraveyardEvent,
    DotnetInstallIdCreatedEvent,
    DotnetLegacyInstallDetectedEvent,
    DotnetLegacyInstallRemovalRequestEvent,
    DotnetNonZeroInstallerExitCodeError,
    DotnetOfflineInstallUsed,
    DotnetUninstallAllCompleted,
    DotnetUninstallAllStarted,
    DotnetUninstallCompleted,
    DotnetUninstallFailed,
    DotnetUninstallStarted,
    DotnetWSLSecurityError,
    EventBasedError,
    EventCancellationError,
    SuppressedAcquisitionError
} from '../EventStream/EventStreamEvents';
import * as versionUtils from './VersionUtilities';

import { promisify } from 'util';
import { IEventStream } from '../EventStream/EventStream';
import { TelemetryUtilities } from '../EventStream/TelemetryUtilities';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IExtensionState } from '../IExtensionState';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { Debugging } from '../Utils/Debugging';
import { FileUtilities } from '../Utils/FileUtilities';
import { IFileUtilities } from '../Utils/IFileUtilities';
import { getInstallFromContext, getInstallIdCustomArchitecture } from '../Utils/InstallIdUtilities';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { executeWithLock, isRunningUnderWSL } from '../Utils/TypescriptUtilities';
import { DOTNET_INFORMATION_CACHE_DURATION_MS, GLOBAL_LOCK_PING_DURATION_MS } from './CacheTimeConstants';
import
{
    DotnetInstall,
    GetDotnetInstallInfo,
    IsEquivalentInstallation,
    IsEquivalentInstallationFile
} from './DotnetInstall';
import { DotnetInstallMode } from './DotnetInstallMode';
import { GlobalInstallerResolver } from './GlobalInstallerResolver';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetCoreAcquisitionWorker } from './IDotnetCoreAcquisitionWorker';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { IGlobalInstaller } from './IGlobalInstaller';
import { InstallationGraveyard } from './InstallationGraveyard';
import
{
    InstallRecord,
} from './InstallRecord';
import { InstallTrackerSingleton } from './InstallTrackerSingleton';
import { LinuxGlobalInstaller } from './LinuxGlobalInstaller';
import { GLOBAL_INSTALL_STATE_MODIFIER_LOCK } from './StringConstants';
import { WinMacGlobalInstaller } from './WinMacGlobalInstaller';


export class DotnetCoreAcquisitionWorker implements IDotnetCoreAcquisitionWorker
{
    private readonly dotnetExecutable: string;
    private globalResolver: GlobalInstallerResolver | null;

    private extensionContext: IVSCodeExtensionContext;

    // @member usingNoInstallInvoker - Only use this for test when using the No Install Invoker to fake the worker into thinking a path is on disk.
    protected usingNoInstallInvoker = false;

    protected file: IFileUtilities;

    constructor(private readonly utilityContext: IUtilityContext, extensionContext: IVSCodeExtensionContext)
    {
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.globalResolver = null;
        this.extensionContext = extensionContext;
        this.file = new FileUtilities();
    }

    public async uninstallAll(eventStream: IEventStream, storagePath: string, extensionState: IExtensionState): Promise<void>
    {
        eventStream.post(new DotnetUninstallAllStarted());
        InstallTrackerSingleton.getInstance(eventStream, extensionState).clearPromises();

        await this.removeFolderRecursively(eventStream, storagePath);

        await InstallTrackerSingleton.getInstance(eventStream, extensionState).uninstallAllRecords();

        eventStream.post(new DotnetUninstallAllCompleted());
    }

    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    public async acquireLocalSDK(context: IAcquisitionWorkerContext, invoker: IAcquisitionInvoker): Promise<IDotnetAcquireResult>
    {
        return this.acquire(context, 'sdk', undefined, invoker);
    }

    public async acquireGlobalSDK(context: IAcquisitionWorkerContext, installerResolver: GlobalInstallerResolver): Promise<IDotnetAcquireResult>
    {
        this.globalResolver = installerResolver;
        return this.acquire(context, 'sdk', installerResolver);
    }

    public async acquireLocalASPNET(context: IAcquisitionWorkerContext, invoker: IAcquisitionInvoker)
    {
        return this.acquire(context, 'aspnetcore', undefined, invoker);
    }

    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    public async acquireLocalRuntime(context: IAcquisitionWorkerContext, invoker: IAcquisitionInvoker): Promise<IDotnetAcquireResult>
    {
        return this.acquire(context, 'runtime', undefined, invoker);
    }

    /**
     * A function that allows installations to work in offline mode by preventing us from pinging the server,
     * to check if the .NET is the newest installed version.
     *
     * @param context
     * @returns null if no existing install matches with the same major.minor.
     * Else, returns the newest existing install that matches the major.minor.
     */
    public async getSimilarExistingInstall(context: IAcquisitionWorkerContext): Promise<IDotnetAcquireResult | null>
    {
        const possibleInstallWithSameMajorMinor = getInstallFromContext(context);
        const installedVersions = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getExistingInstalls(true);

        for (const install of installedVersions)
        {
            if (install.dotnetInstall.installMode === possibleInstallWithSameMajorMinor.installMode &&
                install.dotnetInstall.architecture === possibleInstallWithSameMajorMinor.architecture &&
                install.dotnetInstall.isGlobal === possibleInstallWithSameMajorMinor.isGlobal &&
                versionUtils.getMajorMinor(install.dotnetInstall.version, context.eventStream, context) ===
                versionUtils.getMajorMinor(possibleInstallWithSameMajorMinor.version, context.eventStream, context))
            {
                // Requested version has already been installed.
                const dotnetExePath = install.dotnetInstall.isGlobal ?
                    os.platform() === 'linux' ?
                        await new LinuxGlobalInstaller(context, this.utilityContext, install.dotnetInstall.version).getExpectedGlobalSDKPath(
                            install.dotnetInstall.version, install.dotnetInstall.architecture) :
                        await new WinMacGlobalInstaller(context, this.utilityContext, install.dotnetInstall.version, '', '').getExpectedGlobalSDKPath(
                            install.dotnetInstall.version, install.dotnetInstall.architecture) :
                    path.join(context.installDirectoryProvider.getInstallDir(install.dotnetInstall.installId), this.dotnetExecutable);

                if ((await this.file.exists(dotnetExePath) || this.usingNoInstallInvoker))
                {
                    context.eventStream.post(new DotnetAcquisitionStatusResolved(possibleInstallWithSameMajorMinor,
                        possibleInstallWithSameMajorMinor.version));
                    context.eventStream.post(new DotnetOfflineInstallUsed(`We detected you are offline and are using the pre-existing .NET installation ${install.dotnetInstall.installId}.
To keep your .NET version up to date, please reconnect to the internet at your soonest convenience.`))
                    return { dotnetPath: dotnetExePath };
                }
            }
        }

        return null;
    }

    /**
     *
     * @param version The version of the runtime or sdk to check
     * @param installRuntime Whether this is a local runtime status check or a local SDK status check.
     * @param architecture The architecture of the install. Undefined means it will be the default arch, which is the node platform arch.
     * @returns The result of the install with the path to dotnet if installed, else undefined.
     */
    public async acquireStatus(context: IAcquisitionWorkerContext, installMode: DotnetInstallMode, architecture?: string): Promise<IDotnetAcquireResult | undefined>
    {
        const version = context.acquisitionContext.version!;
        const install = GetDotnetInstallInfo(version, installMode, 'local',
            architecture ? architecture : context.acquisitionContext.architecture ?? this.getDefaultInternalArchitecture(context.acquisitionContext.architecture))

        const existingAcquisitionPromise = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getPromise(install, context.acquisitionContext, true);
        if (existingAcquisitionPromise)
        {
            return { dotnetPath: existingAcquisitionPromise } as IDotnetAcquireResult;
        }

        const dotnetInstallDir = context.installDirectoryProvider.getInstallDir(install.installId);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);
        const installedVersions = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getExistingInstalls(true);

        if (installedVersions.some(x => IsEquivalentInstallationFile(x.dotnetInstall, install)) && (fs.existsSync(dotnetPath) || this.usingNoInstallInvoker))
        {
            // Requested version has already been installed.
            context.eventStream.post(new DotnetAcquisitionStatusResolved(install, version));
            return { dotnetPath };
        }
        else if ((installedVersions?.length ?? 0) === 0 && await this.file.exists(dotnetPath) && installMode === 'sdk')
        {
            // The education bundle already laid down a local install, add it to our managed installs
            const preinstalledVersions = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).checkForUnrecordedLocalSDKSuccessfulInstall(
                context, dotnetInstallDir, installedVersions);
            if (preinstalledVersions.some(x => IsEquivalentInstallationFile(x.dotnetInstall, install)) &&
                (await this.file.exists(dotnetPath) || this.usingNoInstallInvoker))
            {
                // Requested version has already been installed.
                context.eventStream.post(new DotnetAcquisitionStatusResolved(install, version));
                return { dotnetPath };
            }
        }

        // Version is not installed
        context.eventStream.post(new DotnetAcquisitionStatusUndefined(install));
        return undefined;
    }

    /**
     *
     * @param version the version to get of the runtime or sdk.
     * @param installRuntime true for runtime acquisition, false for SDK.
     * @param globalInstallerResolver Create this and add it to install globally.
     * @returns the dotnet acquisition result.
     */
    private async acquire(context: IAcquisitionWorkerContext, mode: DotnetInstallMode,
        globalInstallerResolver: GlobalInstallerResolver | null = null, localInvoker?: IAcquisitionInvoker): Promise<IDotnetAcquireResult>
    {
        if (globalInstallerResolver)
        {
            context.acquisitionContext.version = await globalInstallerResolver.getFullySpecifiedVersion();
        }
        const version = context.acquisitionContext.version;
        let install = GetDotnetInstallInfo(version, mode, globalInstallerResolver ? 'global' : 'local',
            context.acquisitionContext.architecture ?? this.getDefaultInternalArchitecture(context.acquisitionContext.architecture));

        // Allow for the architecture to be null, which is a legacy behavior.
        if (context.acquisitionContext.architecture === null && context.acquisitionContext.architecture !== undefined)
        {
            install =
                {
                    installId: getInstallIdCustomArchitecture(version, context.acquisitionContext.architecture,
                        context.acquisitionContext.mode!, globalInstallerResolver ? 'global' : 'local'),
                    version: install.version,
                    isGlobal: install.isGlobal,
                    installMode: mode,
                } as DotnetInstall
        }

        context.eventStream.post(new DotnetInstallIdCreatedEvent(`The requested version ${version} is now marked under the install: ${JSON.stringify(install)}.`));
        const existingAcquisitionPromise = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getPromise(install, context.acquisitionContext);
        if (existingAcquisitionPromise)
        {
            return { dotnetPath: existingAcquisitionPromise } as IDotnetAcquireResult;
        }
        else
        {
            // We're the only one acquiring this version of dotnet, start the acquisition process.
            let acquisitionPromise = null;
            if (globalInstallerResolver)
            {
                Debugging.log(`The Acquisition Worker has Determined a Global Install was requested.`, context.eventStream);

                acquisitionPromise = this.acquireGlobalCore(context, globalInstallerResolver, install).catch(async (error: any) =>
                {
                    await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).untrackInstallingVersion(context, install);
                    await new CommandExecutor(context, this.utilityContext).endSudoProcessMaster(context.eventStream).catch(() => {});
                    const err = this.getErrorOrStringAsEventError(error);
                    throw err;
                });
            }
            else
            {
                acquisitionPromise = this.acquireLocalCore(context, mode, install, localInvoker!).catch(async (error: any) =>
                {
                    await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).untrackInstallingVersion(context, install);
                    const err = this.getErrorOrStringAsEventError(error);
                    throw err;
                });
            }

            // Put this promise into the list so we can let other requests run at the same time
            // Allows us to return the end result of this current request for any following duplicates while we are still running.
            InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).addPromise(install, acquisitionPromise);
            return acquisitionPromise.then((res) => ({ dotnetPath: res }));
        }
    }

    /**
     *
     * @param version The version of the object to acquire.
     * @param installRuntime true if the request is to install the runtime, false for the SDK.
     * @param install The install record / id of the version managed by us.
     * @returns the dotnet path of the acquired dotnet.
     *
     * @remarks it is called "core" because it is the meat of the actual acquisition work; this has nothing to do with .NET core vs framework.
     */
    private async acquireLocalCore(context: IAcquisitionWorkerContext, mode: DotnetInstallMode, install: DotnetInstall, acquisitionInvoker: IAcquisitionInvoker): Promise<string>
    {
        const version = context.acquisitionContext.version!;
        this.checkForPartialInstalls(context, install).catch(() => {});

        let installedVersions = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getExistingInstalls(true);
        const dotnetInstallDir = context.installDirectoryProvider.getInstallDir(install.installId);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);

        if (await this.file.exists(dotnetPath) && (installedVersions?.length ?? 0) === 0)
        {
            // The education bundle already laid down a local install, add it to our managed installs
            installedVersions = await InstallTrackerSingleton.getInstance(context.eventStream,
                context.extensionState).checkForUnrecordedLocalSDKSuccessfulInstall(context, dotnetInstallDir, installedVersions);
        }

        const existingInstall = await this.getExistingInstall(context, installedVersions, install, dotnetPath);
        if (existingInstall)
        {
            return existingInstall;
        }

        // We update the extension state to indicate we're starting a .NET Core installation.
        await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).trackInstallingVersion(context, install);

        const installContext = {
            installDir: dotnetInstallDir,
            version,
            dotnetPath,
            timeoutSeconds: context.timeoutSeconds,
            installMode: mode,
            installType: context.acquisitionContext.installType ?? 'local', // Before this API param existed, all calls were for local types.
            architecture: context.acquisitionContext.architecture ?? this.getDefaultInternalArchitecture(context.acquisitionContext.architecture),
        } as IDotnetInstallationContext;
        context.acquisitionContext.architecture = installContext.architecture;
        context.eventStream.post(new DotnetAcquisitionStarted(install, version, context.acquisitionContext.requestingExtensionId));
        await acquisitionInvoker.installDotnet(installContext, install).catch((reason) =>
        {
            throw reason; // This will get handled and cast into an event based error by its caller.
        });
        context.installationValidator.validateDotnetInstall(install, dotnetPath);

        await this.removeMatchingLegacyInstall(context, installedVersions, version);
        await this.tryCleanUpInstallGraveyard(context);

        await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).reclassifyInstallingVersionToInstalled(context, install);

        return dotnetPath;
    }

    private async getExistingInstall(context: IAcquisitionWorkerContext, installedVersions: InstallRecord[], install: DotnetInstall, dotnetPath: string): Promise<string | null>
    {
        if (installedVersions.some(x => IsEquivalentInstallation(x.dotnetInstall, install) && (fs.existsSync(dotnetPath) || this.usingNoInstallInvoker)))
        {
            // Version requested has already been installed.
            try
            {
                context.installationValidator.validateDotnetInstall(install, dotnetPath, false, false);
            }
            catch (error: any)
            {
                return null;
            }

            if (context.acquisitionContext.installType === 'global')
            {
                if (!(await this.sdkIsFound(context, context.acquisitionContext.version)))
                {
                    await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).untrackInstalledVersion(context, install);
                    return null;
                }
            }

            context.eventStream.post(new DotnetAcquisitionAlreadyInstalled(install,
                (context.acquisitionContext && context.acquisitionContext.requestingExtensionId)
                    ? context.acquisitionContext.requestingExtensionId : null));

            await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).trackInstalledVersion(context, install);
            return dotnetPath;
        }
        return null;
    }

    private async sdkIsFound(context: IAcquisitionWorkerContext, version: string): Promise<boolean>
    {
        const executor = new CommandExecutor(context, this.utilityContext);
        const listSDKsCommand = CommandExecutor.makeCommand('dotnet', ['--list-sdks']);
        const result = await executor.execute(listSDKsCommand, { dotnetInstallToolCacheTtlMs: DOTNET_INFORMATION_CACHE_DURATION_MS }, false);

        if (result.status !== '0')
        {
            return false;
        }

        return result.stdout.includes(version);
    }

    private async checkForPartialInstalls(context: IAcquisitionWorkerContext, installId: DotnetInstall)
    {
        const installingVersions = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getExistingInstalls(false);
        const partialInstall = installingVersions?.some(x => x.dotnetInstall.installId === installId.installId);

        // Don't count it as partial if the promise is still being resolved.
        // The promises get wiped out upon reload, so we can check this.
        if (partialInstall && await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getPromise(installId, context.acquisitionContext, true) === null)
        {
            // Partial install, we never updated our extension to no longer be 'installing'. Maybe someone killed the vscode process or we failed in an unexpected way.
            context.eventStream.post(new DotnetAcquisitionPartialInstallation(installId));

            // Delete the existing local files so we can re-install. For global installs, let the installer handle it.
            await this.uninstallLocal(context, installId);
        }
    }

    public async tryCleanUpInstallGraveyard(context: IAcquisitionWorkerContext): Promise<void>
    {
        const graveyard = new InstallationGraveyard(context);
        const installsToRemove = await graveyard.get();
        for (const install of installsToRemove)
        {
            context.eventStream.post(new DotnetInstallGraveyardEvent(
                `Attempting to remove .NET at ${JSON.stringify(install)} again, as it was left in the graveyard.`));
            await this.uninstallLocal(context, install);
        }
    }

    private getDefaultInternalArchitecture(existingArch: string | null | undefined)
    {
        if (existingArch !== null && existingArch !== undefined)
        {
            return existingArch;
        }
        if (existingArch === null)
        {
            return 'null';
        }
        return DotnetCoreAcquisitionWorker.defaultArchitecture();
    }

    public static defaultArchitecture(): string
    {
        return os.arch();
    }

    private getErrorOrStringAsEventError(error: any)
    {
        if (error instanceof EventBasedError || error instanceof EventCancellationError)
        {
            error.message = `.NET Acquisition Failed: ${error.message}, ${error?.stack}`;
            return error;
        }
        else
        {
            // Remove this when https://github.com/typescript-eslint/typescript-eslint/issues/2728 is done
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const newError = new EventBasedError('DotnetAcquisitionError', `.NET Acquisition Failed: ${error?.message ?? JSON.stringify(error)}`);
            return newError;
        }
    }

    private async acquireGlobalCore(context: IAcquisitionWorkerContext, globalInstallerResolver: GlobalInstallerResolver, install: DotnetInstall): Promise<string>
    {
        if (await isRunningUnderWSL(context, this.utilityContext))
        {
            const err = new DotnetWSLSecurityError(new EventCancellationError('DotnetWSLSecurityError',
                `Automatic .NET SDK Installation is not yet supported in WSL due to VS Code & WSL limitations.
            Please install the .NET SDK manually by following https://learn.microsoft.com/en-us/dotnet/core/install/linux-ubuntu. Then, add it to the path by following https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md#manually-installing-net`,
            ), getInstallFromContext(context));
            context.eventStream.post(err);
            throw err.error;
        }

        const installingVersion = await globalInstallerResolver.getFullySpecifiedVersion();
        context.eventStream.post(new DotnetGlobalVersionResolutionCompletionEvent(`The version we resolved that was requested is: ${installingVersion}.`));
        this.checkForPartialInstalls(context, install).catch(() => {});

        const installedVersions = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getExistingInstalls(true);

        const installer: IGlobalInstaller = os.platform() === 'linux' ?
            new LinuxGlobalInstaller(context, this.utilityContext, installingVersion) :
            new WinMacGlobalInstaller(context, this.utilityContext, installingVersion, await globalInstallerResolver.getInstallerUrl(), await globalInstallerResolver.getInstallerHash());

        // See if we should return a fake path instead of running the install
        if (process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH && process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH === 'true')
        {
            context.eventStream.post(new DotnetFakeSDKEnvironmentVariableTriggered(`VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH has been set.`));
            return 'fake-sdk';
        }

        let dotnetPath: string = await installer.getExpectedGlobalSDKPath(installingVersion,
            context.acquisitionContext.architecture ?? this.getDefaultInternalArchitecture(context.acquisitionContext.architecture), false);
        const existingInstall = await this.getExistingInstall(context, installedVersions, install, dotnetPath);
        if (existingInstall)
        {
            return existingInstall;
        }

        context.eventStream.post(new DotnetAcquisitionStarted(install, installingVersion, context.acquisitionContext.requestingExtensionId));
        await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).trackInstallingVersion(context, install);

        context.eventStream.post(new DotnetBeginGlobalInstallerExecution(`Beginning to run installer for ${JSON.stringify(install)} in ${os.platform()}.`))
        const installerResult = await installer.installSDK(install);
        context.eventStream.post(new DotnetCompletedGlobalInstallerExecution(`Completed installer for ${JSON.stringify(install)} in ${os.platform()}.`))

        if (installerResult !== '0')
        {
            const err = new DotnetNonZeroInstallerExitCodeError(new EventBasedError('DotnetNonZeroInstallerExitCodeError',
                `An error was raised by the .NET SDK installer. The exit code it gave us: ${installerResult}.
${WinMacGlobalInstaller.InterpretExitCode(installerResult)}`), install);
            context.eventStream.post(err);
            throw err;
        }

        TelemetryUtilities.setDotnetSDKTelemetryToMatch(context.isExtensionTelemetryInitiallyEnabled, this.extensionContext, context, this.utilityContext).catch(() => {});

        // in case the path does not exist, try resetting the path using an automatic path search setting
        dotnetPath = await installer.getExpectedGlobalSDKPath(installingVersion,
            context.acquisitionContext.architecture ?? this.getDefaultInternalArchitecture(context.acquisitionContext.architecture));

        context.installationValidator.validateDotnetInstall(install, dotnetPath, os.platform() === 'darwin', os.platform() !== 'darwin');

        context.eventStream.post(new DotnetAcquisitionCompleted(install, dotnetPath, installingVersion));

        await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).reclassifyInstallingVersionToInstalled(context, install);

        await new CommandExecutor(context, this.utilityContext).endSudoProcessMaster(context.eventStream);
        context.eventStream.post(new DotnetGlobalAcquisitionCompletionEvent(`The version ${JSON.stringify(install)} completed successfully.`));
        return dotnetPath;
    }

    /**
     *
     * @param installedVersions - all of the currently installed versions of dotnet managed by the extension
     * @param version - the version that is about to be installed
     *
     * @remarks Before, installed versions used their version as the 'install id' in the promises and folder structure.
     * We changed this install id to include architecture so different architectures could be installed side-by-side.
     * This means any installs that were made before version 1.8.0 will not have the architecture in their install id.
     * They should be removed. This is what makes an install 'legacy'.
     *
     * This function only removes the legacy install with the same version as 'version'.
     * That's because removing other legacy installs may cause a breaking change.
     * Assuming the install succeeds, this will not break as the legacy install of 'version' will be replaced by a non-legacy one upon completion.
     *
     * Many (if not most) legacy installs will actually hold the same content as the newly installed runtime/sdk.
     * But since we don't want to be in the business of detecting their architecture, we chose this option as opposed to renaming and install id and folder
     * ... for the legacy install.
     *
     * Note : only local installs were ever 'legacy.'
     */
    private async removeMatchingLegacyInstall(context: IAcquisitionWorkerContext, installedVersions: InstallRecord[], version: string)
    {
        const legacyInstalls = this.existingLegacyInstalls(context, installedVersions);
        for (const legacyInstall of legacyInstalls)
        {
            if (legacyInstall.dotnetInstall.installId.includes(version))
            {
                context.eventStream.post(new DotnetLegacyInstallRemovalRequestEvent(`Trying to remove legacy install: ${JSON.stringify(legacyInstall)} of ${version}.`));
                await this.uninstallLocal(context, legacyInstall.dotnetInstall);
            }
        }
    }

    /**
     *
     * @param allInstalls all of the existing installs.
     * @returns All existing installs made by the extension that don't include a - for the architecture. Not all of the ones which use a string type.
     */
    private existingLegacyInstalls(context: IAcquisitionWorkerContext, allInstalls: InstallRecord[]): InstallRecord[]
    {
        let legacyInstalls: InstallRecord[] = [];
        for (const install of allInstalls)
        {
            // Assumption: .NET versions so far did not include ~ in them, but we do for our non-legacy ids.
            if (!install.dotnetInstall.installId.includes('~'))
            {
                context.eventStream.post(new DotnetLegacyInstallDetectedEvent(`A legacy install was detected -- ${JSON.stringify(install)}.`));
                legacyInstalls = legacyInstalls.concat(install);
            }
        }
        return legacyInstalls;
    }


    public async uninstallLocal(context: IAcquisitionWorkerContext, install: DotnetInstall, force = false): Promise<string>
    {
        if (install.isGlobal)
        {
            return '0';
        }

        try
        {
            const dotnetInstallDir = context.installDirectoryProvider.getInstallDir(install.installId);
            const graveyard = new InstallationGraveyard(context);

            await graveyard.add(install, dotnetInstallDir);
            context.eventStream.post(new DotnetInstallGraveyardEvent(`Attempting to remove .NET at ${JSON.stringify(install)} in path ${dotnetInstallDir}`));

            await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).untrackInstalledVersion(context, install, force);
            // this is the only place where installed and installing could deal with pre existing installing id
            await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).untrackInstallingVersion(context, install, force);

            if (force || await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).canUninstall(true, install))
            {
                context.eventStream.post(new DotnetUninstallStarted(`Attempting to remove .NET ${install.installId}.`));
                await this.removeFolderRecursively(context.eventStream, dotnetInstallDir);
                context.eventStream.post(new DotnetUninstallCompleted(`Uninstalled .NET ${install.installId}.`));
                await graveyard.remove(install);
                context.eventStream.post(new DotnetInstallGraveyardEvent(`Success at uninstalling ${JSON.stringify(install)} in path ${dotnetInstallDir}`));
            }
            else
            {
                context.eventStream.post(new DotnetInstallGraveyardEvent(`Removed reference of ${JSON.stringify(install)} in path ${dotnetInstallDir}, but did not uninstall.
Other dependents remain.`));
            }

            return '0';
        }
        catch (error: any)
        {
            context.eventStream.post(new SuppressedAcquisitionError(error, `The attempt to uninstall .NET ${install.installId} failed - was .NET in use?`));
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            return error?.message ?? '1';
        }
    }

    public async uninstallGlobal(context: IAcquisitionWorkerContext, install: DotnetInstall, globalInstallerResolver: GlobalInstallerResolver, force = false): Promise<string>
    {
        return executeWithLock(context.eventStream, false, GLOBAL_INSTALL_STATE_MODIFIER_LOCK(context.installDirectoryProvider,
            install), GLOBAL_LOCK_PING_DURATION_MS, context.timeoutSeconds * 1000,
            async () =>
            {
                try
                {
                    context.eventStream.post(new DotnetUninstallStarted(`Attempting to remove .NET ${install.installId}.`));

                    await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).untrackInstalledVersion(context, install, force);
                    // this is the only place where installed and installing could deal with pre existing installing id
                    await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).untrackInstallingVersion(context, install, force);

                    if (force || await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).canUninstall(true, install))
                    {
                        const installingVersion = await globalInstallerResolver.getFullySpecifiedVersion();
                        const installer: IGlobalInstaller = os.platform() === 'linux' ?
                            new LinuxGlobalInstaller(context, this.utilityContext, installingVersion) :
                            new WinMacGlobalInstaller(context, this.utilityContext, installingVersion, await globalInstallerResolver.getInstallerUrl(), await globalInstallerResolver.getInstallerHash());

                        const ok = await installer.uninstallSDK(install);
                        await new CommandExecutor(context, this.utilityContext).endSudoProcessMaster(context.eventStream);
                        if (ok === '0')
                        {
                            context.eventStream.post(new DotnetUninstallCompleted(`Uninstalled .NET ${install.installId}.`));
                            return '0';
                        }
                    }
                    context.eventStream.post(new DotnetUninstallFailed(`Failed to uninstall .NET ${install.installId}. Uninstall manually or delete the folder.`));
                    return '117778'; // arbitrary error code to indicate uninstall failed without error.
                }
                catch (error: any)
                {
                    await new CommandExecutor(context, this.utilityContext).endSudoProcessMaster(context.eventStream);
                    context.eventStream.post(new SuppressedAcquisitionError(error, `The attempt to uninstall .NET ${install.installId} failed - was .NET in use?`));
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    return error?.message ?? '1';
                }
            });
    }

    private async removeFolderRecursively(eventStream: IEventStream, folderPath: string)
    {
        eventStream.post(new DotnetAcquisitionDeletion(folderPath));
        try
        {
            await fs.promises.chmod(folderPath, 0o744);
        }
        catch (error: any)
        {
            eventStream.post(new SuppressedAcquisitionError(error, `Failed to chmod +x on .NET folder ${folderPath} when marked for deletion.`));
        }

        try
        {
            await promisify(rimraf)(folderPath);
        }
        catch (error: any)
        {
            eventStream.post(new SuppressedAcquisitionError(error, `Failed to delete .NET folder ${folderPath} when marked for deletion.`));
        }
    }
}

