/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import rimraf = require('rimraf');

import {
    DotnetAcquisitionAlreadyInstalled,
    DotnetAcquisitionCompleted,
    DotnetAcquisitionDeletion,
    DotnetAcquisitionInProgress,
    DotnetAcquisitionPartialInstallation,
    DotnetAcquisitionStarted,
    DotnetAcquisitionStatusResolved,
    DotnetAcquisitionStatusUndefined,
    DotnetNonZeroInstallerExitCodeError,
    DotnetInstallGraveyardEvent,
    DotnetInstallKeyCreatedEvent,
    DotnetLegacyInstallDetectedEvent,
    DotnetLegacyInstallRemovalRequestEvent,
    DotnetUninstallAllCompleted,
    DotnetUninstallAllStarted,
    DotnetGlobalAcquisitionCompletionEvent,
    DotnetGlobalVersionResolutionCompletionEvent,
    DotnetBeginGlobalInstallerExecution,
    DotnetCompletedGlobalInstallerExecution,
    DotnetFakeSDKEnvironmentVariableTriggered,
    SuppressedAcquisitionError,
    EventBasedError,
} from '../EventStream/EventStreamEvents';

import { GlobalInstallerResolver } from './GlobalInstallerResolver';
import { WinMacGlobalInstaller } from './WinMacGlobalInstaller';
import { LinuxGlobalInstaller } from './LinuxGlobalInstaller';
import { TelemetryUtilities } from '../EventStream/TelemetryUtilities';
import { Debugging } from '../Utils/Debugging';
import { IDotnetAcquireContext} from '../IDotnetAcquireContext';
import { IGlobalInstaller } from './IGlobalInstaller';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { IAcquisitionInvoker } from './IAcquisitionInvoker';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetCoreAcquisitionWorker } from './IDotnetCoreAcquisitionWorker';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import {
    InstallRecord,
} from './InstallRecord';
import {
    GetDotnetInstallInfo,
    IsEquivalentInstallationFile,
    IsEquivalentInstallation
} from './DotnetInstall';
import { DotnetInstall } from './DotnetInstall';
import { InstallationGraveyard } from './InstallationGraveyard';
import { InstallTracker } from './InstallTracker';
import { DotnetInstallMode } from './DotnetInstallMode';

/* tslint:disable:no-any */

export class DotnetCoreAcquisitionWorker implements IDotnetCoreAcquisitionWorker
{
    public installingArchitecture : string | null;
    private readonly dotnetExecutable: string;
    private globalResolver: GlobalInstallerResolver | null;

    protected installTracker: InstallTracker;
    protected graveyard : InstallationGraveyard;
    private extensionContext : IVSCodeExtensionContext;

    // @member usingNoInstallInvoker - Only use this for test when using the No Install Invoker to fake the worker into thinking a path is on disk.
    protected usingNoInstallInvoker = false;

    constructor(protected readonly context: IAcquisitionWorkerContext, private readonly utilityContext : IUtilityContext, extensionContext : IVSCodeExtensionContext) {
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.graveyard = new InstallationGraveyard(context);
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.installTracker = new InstallTracker(this.context);
        // null deliberately allowed to use old behavior below
        this.installingArchitecture = this.context.installingArchitecture === undefined ? os.arch() : this.context.installingArchitecture;
        this.globalResolver = null;
        this.extensionContext = extensionContext;
    }

    public async uninstallAll() {
        this.context.eventStream.post(new DotnetUninstallAllStarted());
        await this.installTracker.clearPromises();

        this.removeFolderRecursively(this.context.installDirectoryProvider.getStoragePath());

        await this.installTracker.uninstallAllRecords();

        this.context.eventStream.post(new DotnetUninstallAllCompleted());
    }

    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    public async acquireSDK(version: string, invoker : IAcquisitionInvoker): Promise<IDotnetAcquireResult> {
        return this.acquire(version, 'sdk', undefined, invoker);
    }

    public async acquireGlobalSDK(installerResolver: GlobalInstallerResolver): Promise<IDotnetAcquireResult>
    {
        this.globalResolver = installerResolver;
        return this.acquire(await installerResolver.getFullySpecifiedVersion(), 'sdk', installerResolver);
    }

    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    public async acquireRuntime(version: string, invoker : IAcquisitionInvoker): Promise<IDotnetAcquireResult> {
        return this.acquire(version, 'runtime', undefined, invoker);
    }

    /**
     *
     * @param version The version of the runtime or sdk to check
     * @param installRuntime Whether this is a local runtime status check or a local SDK status check.
     * @param architecture The architecture of the install. Undefined means it will be the default arch, which is the node platform arch.
     * @returns The result of the install with the path to dotnet if installed, else undefined.
     */
    public async acquireStatus(version: string, installMode: DotnetInstallMode, architecture? : string): Promise<IDotnetAcquireResult | undefined>
    {
        const install = GetDotnetInstallInfo(version, installMode, false, architecture ? architecture : this.installingArchitecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture())

        const existingAcquisitionPromise = this.installTracker.getPromise(install);
        if (existingAcquisitionPromise)
        {
            // Requested version is being acquired
            this.context.eventStream.post(new DotnetAcquisitionStatusResolved(install, version));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        }

        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(install.installKey);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);
        const installedVersions = await this.installTracker.getExistingInstalls(true);

        if (installedVersions.some(x => IsEquivalentInstallationFile(x.dotnetInstall, install)) && (fs.existsSync(dotnetPath) || this.usingNoInstallInvoker ))
        {
            // Requested version has already been installed.
            this.context.eventStream.post(new DotnetAcquisitionStatusResolved(install, version));
            return { dotnetPath };
        }
        else if(installedVersions.length === 0 && fs.existsSync(dotnetPath) && installMode === 'sdk')
        {
            // The education bundle already laid down a local install, add it to our managed installs
            const preinstalledVersions = await this.installTracker.checkForUnrecordedLocalSDKSuccessfulInstall(dotnetInstallDir, installedVersions);
            if (preinstalledVersions.some(x => IsEquivalentInstallationFile(x.dotnetInstall, install)) &&
                (fs.existsSync(dotnetPath) || this.usingNoInstallInvoker ))
            {
                // Requested version has already been installed.
                this.context.eventStream.post(new DotnetAcquisitionStatusResolved(install, version));
                return { dotnetPath };
            }
        }

        // Version is not installed
        this.context.eventStream.post(new DotnetAcquisitionStatusUndefined(install));
        return undefined;
    }

    /**
     *
     * @param version the version to get of the runtime or sdk.
     * @param installRuntime true for runtime acquisition, false for SDK.
     * @param globalInstallerResolver Create this and add it to install globally.
     * @returns the dotnet acquisition result.
     */
    private async acquire(version: string, mode: DotnetInstallMode,
        globalInstallerResolver : GlobalInstallerResolver | null = null, localInvoker? : IAcquisitionInvoker): Promise<IDotnetAcquireResult>
    {
        let install = GetDotnetInstallInfo(version, mode, globalInstallerResolver !== null, this.installingArchitecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture());

        // Allow for the architecture to be null, which is a legacy behavior.
        if(this.context.acquisitionContext?.architecture === null && this.context.acquisitionContext?.architecture !== undefined)
        {
            install =
            {
                installKey: DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(version, null, globalInstallerResolver !== null),
                version: install.version,
                isGlobal: install.isGlobal,
                installMode: mode,
            } as DotnetInstall
        }

        this.context.eventStream.post(new DotnetInstallKeyCreatedEvent(`The requested version ${version} is now marked under the install key: ${install}.`));
        const existingAcquisitionPromise = this.installTracker.getPromise(install);
        if (existingAcquisitionPromise)
        {
            // This version of dotnet is already being acquired. Memoize the promise.
            this.context.eventStream.post(new DotnetAcquisitionInProgress(install,
                    (this.context.acquisitionContext && this.context.acquisitionContext.requestingExtensionId)
                    ? this.context.acquisitionContext!.requestingExtensionId : null));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        }
        else
        {
            // We're the only one acquiring this version of dotnet, start the acquisition process.
            let acquisitionPromise = null;
            if(globalInstallerResolver !== null)
            {
                Debugging.log(`The Acquisition Worker has Determined a Global Install was requested.`, this.context.eventStream);

                acquisitionPromise = this.acquireGlobalCore(globalInstallerResolver, install).catch(async (error: Error) => {
                    await this.installTracker.untrackInstallingVersion(install);
                    error.message = `.NET Acquisition Failed: ${error.message}`;
                    throw error;
                });
            }
            else
            {
                Debugging.log(`The Acquisition Worker has Determined a Local Install was requested.`, this.context.eventStream);

                acquisitionPromise = this.acquireLocalCore(version, mode, install, localInvoker!).catch(async (error: Error) => {
                    await this.installTracker.untrackInstallingVersion(install);
                    error.message = `.NET Acquisition Failed: ${error.message}`;
                    throw error;
                });
            }

            // Put this promise into the list so we can let other requests run at the same time
            // Allows us to return the end result of this current request for any following duplicates while we are still running.
            await this.installTracker.addPromise(install, acquisitionPromise);
            return acquisitionPromise.then((res) => ({ dotnetPath: res }));
        }
    }

    public static getInstallKeyCustomArchitecture(version : string, architecture: string | null | undefined, isGlobal = false) : string
    {
        if(!architecture)
        {
            // Use the legacy method (no architecture) of installs
            return isGlobal ? `${version}-global` : version;
        }
        else
        {
            return isGlobal ? `${version}-global~${architecture}` : `${version}~${architecture}`;
        }
    }

    public getInstallKey(version : string) : string
    {
        return DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(version, this.installingArchitecture, this.globalResolver !== null);
    }

    /**
     *
     * @param version The version of the object to acquire.
     * @param installRuntime true if the request is to install the runtime, false for the SDK.
     * @param install The install record / key of the version managed by us.
     * @returns the dotnet path of the acquired dotnet.
     *
     * @remarks it is called "core" because it is the meat of the actual acquisition work; this has nothing to do with .NET core vs framework.
     */
    private async acquireLocalCore(version: string, mode: DotnetInstallMode, install : DotnetInstall, acquisitionInvoker : IAcquisitionInvoker): Promise<string>
    {
        this.checkForPartialInstalls(install);

        let installedVersions = await this.installTracker.getExistingInstalls(true);
        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(install.installKey);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);

        if (fs.existsSync(dotnetPath) && installedVersions.length === 0) {
            // The education bundle already laid down a local install, add it to our managed installs
            installedVersions = await this.installTracker.checkForUnrecordedLocalSDKSuccessfulInstall(dotnetInstallDir, installedVersions);
        }

        if (installedVersions.some(x => IsEquivalentInstallation(x.dotnetInstall, install) && (fs.existsSync(dotnetPath) || this.usingNoInstallInvoker)))
        {
            // Version requested has already been installed.
            // We don't do this check with global acquisition, since external sources can more easily tamper with installs.
            this.context.installationValidator.validateDotnetInstall(install, dotnetPath);

            this.context.eventStream.post(new DotnetAcquisitionAlreadyInstalled(install,
                (this.context.acquisitionContext && this.context.acquisitionContext.requestingExtensionId)
                ? this.context.acquisitionContext!.requestingExtensionId : null));

            await this.installTracker.trackInstalledVersion(install);
            return dotnetPath;
        }

        // We update the extension state to indicate we're starting a .NET Core installation.
        await this.installTracker.trackInstallingVersion(install);

        const installContext = {
            installDir: dotnetInstallDir,
            version,
            dotnetPath,
            timeoutSeconds: this.context.timeoutSeconds,
            installRuntime : mode === 'runtime',
            installMode : mode,
            architecture: this.installingArchitecture
        } as IDotnetInstallationContext;
        this.context.eventStream.post(new DotnetAcquisitionStarted(install, version, this.context.acquisitionContext?.requestingExtensionId));
        await acquisitionInvoker.installDotnet(installContext, install).catch((reason) => {
            reason.message = (`Installation failed: ${reason.message}`);
            throw reason;
        });
        this.context.installationValidator.validateDotnetInstall(install, dotnetPath);

        await this.removeMatchingLegacyInstall(installedVersions, version);
        await this.tryCleanUpInstallGraveyard();

        await this.installTracker.reclassifyInstallingVersionToInstalled(install);

        return dotnetPath;
    }

    private async checkForPartialInstalls(installKey : DotnetInstall)
    {
        const installingVersions = await this.installTracker.getExistingInstalls(false);
        const partialInstall = installingVersions.some(x => x.dotnetInstall.installKey === installKey.installKey);

        // Don't count it as partial if the promise is still being resolved.
        // The promises get wiped out upon reload, so we can check this.
        if (partialInstall && this.installTracker.getPromise(installKey) === null)
        {
            // Partial install, we never updated our extension to no longer be 'installing'. Maybe someone killed the vscode process or we failed in an unexpected way.
            this.context.eventStream.post(new DotnetAcquisitionPartialInstallation(installKey));

            // Delete the existing local files so we can re-install. For global installs, let the installer handle it.
            await this.uninstallLocalRuntimeOrSDK(installKey);
        }
    }

    public async tryCleanUpInstallGraveyard() : Promise<void>
    {
        const installsToRemove = await this.graveyard.get();
        for(const installKey of installsToRemove)
        {
            this.context.eventStream.post(new DotnetInstallGraveyardEvent(
                `Attempting to remove .NET at ${installKey.installKey} again, as it was left in the graveyard.`));
            await this.uninstallLocalRuntimeOrSDK(installKey);
        }
    }

    public static defaultArchitecture() : string
    {
        return os.arch();
    }

    private async acquireGlobalCore(globalInstallerResolver : GlobalInstallerResolver, install : DotnetInstall): Promise<string>
    {
        const installingVersion = await globalInstallerResolver.getFullySpecifiedVersion();
        this.context.eventStream.post(new DotnetGlobalVersionResolutionCompletionEvent(`The version we resolved that was requested is: ${installingVersion}.`));
        this.checkForPartialInstalls(install);

        const installer : IGlobalInstaller = os.platform() === 'linux' ?
            new LinuxGlobalInstaller(this.context, this.utilityContext, installingVersion) :
            new WinMacGlobalInstaller(this.context, this.utilityContext, installingVersion, await globalInstallerResolver.getInstallerUrl(), await globalInstallerResolver.getInstallerHash());

        await this.installTracker.trackInstallingVersion(install);
        this.context.eventStream.post(new DotnetAcquisitionStarted(install, installingVersion, this.context.acquisitionContext?.requestingExtensionId));

        // See if we should return a fake path instead of running the install
        if(process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH && process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH === 'true')
        {
            this.context.eventStream.post(new DotnetFakeSDKEnvironmentVariableTriggered(`VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH has been set.`));
            return 'fake-sdk';
        }

        this.context.eventStream.post(new DotnetBeginGlobalInstallerExecution(`Beginning to run installer for ${install} in ${os.platform()}.`))
        const installerResult = await installer.installSDK(install);
        this.context.eventStream.post(new DotnetCompletedGlobalInstallerExecution(`Completed installer for ${install} in ${os.platform()}.`))

        if(installerResult !== '0')
        {
            const err = new DotnetNonZeroInstallerExitCodeError(new EventBasedError('DotnetNonZeroInstallerExitCodeError',
                `An error was raised by the .NET SDK installer. The exit code it gave us: ${installerResult}`), install);
            this.context.eventStream.post(err);
            throw err;
        }

        const installedSDKPath : string = await installer.getExpectedGlobalSDKPath(installingVersion, DotnetCoreAcquisitionWorker.defaultArchitecture());

        TelemetryUtilities.setDotnetSDKTelemetryToMatch(this.context.isExtensionTelemetryInitiallyEnabled, this.extensionContext, this.context, this.utilityContext);

        this.context.installationValidator.validateDotnetInstall(install, installedSDKPath, os.platform() !== 'win32');

        this.context.eventStream.post(new DotnetAcquisitionCompleted(install, installedSDKPath, installingVersion));

        await this.installTracker.reclassifyInstallingVersionToInstalled(install);

        this.context.eventStream.post(new DotnetGlobalAcquisitionCompletionEvent(`The version ${install} completed successfully.`));
        return installedSDKPath;
    }

    public setAcquisitionContext(context : IDotnetAcquireContext)
    {
        this.context.acquisitionContext = context;
    }

    /**
     *
     * @param installedVersions - all of the currently installed versions of dotnet managed by the extension
     * @param version - the version that is about to be installed
     *
     * @remarks Before, installed versions used their version as the 'install key' in the promises and folder structure.
     * We changed this install key to include architecture so different architectures could be installed side-by-side.
     * This means any installs that were made before version 1.8.0 will not have the architecture in their install key.
     * They should be removed. This is what makes an install 'legacy'.
     *
     * This function only removes the legacy install with the same version as 'version'.
     * That's because removing other legacy installs may cause a breaking change.
     * Assuming the install succeeds, this will not break as the legacy install of 'version' will be replaced by a non-legacy one upon completion.
     *
     * Many (if not most) legacy installs will actually hold the same content as the newly installed runtime/sdk.
     * But since we don't want to be in the business of detecting their architecture, we chose this option as opposed to renaming and install key and folder
     * ... for the legacy install.
     *
     * Note : only local installs were ever 'legacy.'
     */
    private async removeMatchingLegacyInstall(installedVersions : InstallRecord[], version : string)
    {
        const legacyInstalls = this.existingLegacyInstalls(installedVersions);
        for(const legacyInstall of legacyInstalls)
        {
            if(legacyInstall.dotnetInstall.installKey.includes(version))
            {
                this.context.eventStream.post(new DotnetLegacyInstallRemovalRequestEvent(`Trying to remove legacy install: ${legacyInstall} of ${version}.`));
                await this.uninstallLocalRuntimeOrSDK(legacyInstall.dotnetInstall);
            }
        }
    }

    /**
     *
     * @param allInstalls all of the existing installs.
     * @returns All existing installs made by the extension that don't include a - for the architecture. Not all of the ones which use a string type.
     */
    private existingLegacyInstalls(allInstalls : InstallRecord[]) : InstallRecord[]
    {
        let legacyInstalls : InstallRecord[] = [];
        for(const install of allInstalls)
        {
            // Assumption: .NET versions so far did not include ~ in them, but we do for our non-legacy keys.
            if(!install.dotnetInstall.installKey.includes('~'))
            {
                this.context.eventStream.post(new DotnetLegacyInstallDetectedEvent(`A legacy install was detected -- ${install}.`));
                legacyInstalls = legacyInstalls.concat(install);
            }
        }
        return legacyInstalls;
    }


    public async uninstallLocalRuntimeOrSDK(install : DotnetInstall)
    {
        if(install.isGlobal)
        {
            return;
        }

        try
        {
            const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(install.installKey);

            this.graveyard.add(install, dotnetInstallDir);
            this.context.eventStream.post(new DotnetInstallGraveyardEvent(`Attempting to remove .NET at ${install} in path ${dotnetInstallDir}`));

            this.removeFolderRecursively(dotnetInstallDir);

            await this.installTracker.untrackInstalledVersion(install);
            // this is the only place where installed and installing could deal with pre existing installing key
            await this.installTracker.untrackInstallingVersion(install);

            this.graveyard.remove(install);
            this.context.eventStream.post(new DotnetInstallGraveyardEvent(`Success at uninstalling ${install} in path ${dotnetInstallDir}`));
        }
        catch(error : any)
        {
            this.context.eventStream.post(new SuppressedAcquisitionError(error, `The attempt to uninstall .NET ${install} failed - was .NET in use?`))
        }
    }


    private removeFolderRecursively(folderPath: string) {
        this.context.eventStream.post(new DotnetAcquisitionDeletion(folderPath));
        try
        {
            fs.chmodSync(folderPath, 0o744);
        }
        catch(error : any)
        {
            this.context.eventStream.post(new SuppressedAcquisitionError(error, `Failed to chmod +x on .NET folder ${folderPath} when marked for deletion.`));
        }

        try
        {
            rimraf.sync(folderPath);
        }
        catch(error : any)
        {
            this.context.eventStream.post(new SuppressedAcquisitionError(error, `Failed to delete .NET folder ${folderPath} when marked for deletion.`));
        }
    }
}

