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
    EventCancellationError,
} from '../EventStream/EventStreamEvents';

import { GlobalInstallerResolver } from './GlobalInstallerResolver';
import { WinMacGlobalInstaller } from './WinMacGlobalInstaller';
import { LinuxGlobalInstaller } from './LinuxGlobalInstaller';
import { TelemetryUtilities } from '../EventStream/TelemetryUtilities';
import { Debugging } from '../Utils/Debugging';
import { DotnetInstallType } from '../IDotnetAcquireContext';
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
import { InstallTrackerSingleton } from './InstallTrackerSingleton';
import { DotnetInstallMode } from './DotnetInstallMode';
import { IEventStream } from '../EventStream/EventStream';
import { strict } from 'assert';
import { IExtensionState } from '../IExtensionState';

/* tslint:disable:no-any */

export class DotnetCoreAcquisitionWorker implements IDotnetCoreAcquisitionWorker
{
    private readonly dotnetExecutable: string;
    private globalResolver: GlobalInstallerResolver | null;

    private extensionContext : IVSCodeExtensionContext;

    // @member usingNoInstallInvoker - Only use this for test when using the No Install Invoker to fake the worker into thinking a path is on disk.
    protected usingNoInstallInvoker = false;

    constructor(private readonly utilityContext : IUtilityContext, extensionContext : IVSCodeExtensionContext) {
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.globalResolver = null;
        this.extensionContext = extensionContext;
    }

    public async uninstallAll(eventStream : IEventStream, storagePath : string, extensionState : IExtensionState): Promise<void>
    {
        eventStream.post(new DotnetUninstallAllStarted());
        await InstallTrackerSingleton.getInstance(eventStream, extensionState).clearPromises();

        this.removeFolderRecursively(eventStream, storagePath);

        await InstallTrackerSingleton.getInstance(eventStream, extensionState).uninstallAllRecords();

        eventStream.post(new DotnetUninstallAllCompleted());
    }

    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    public async acquireSDK(context: IAcquisitionWorkerContext, invoker : IAcquisitionInvoker): Promise<IDotnetAcquireResult> {
        return this.acquire(context, 'sdk', undefined, invoker);
    }

    public async acquireGlobalSDK(context: IAcquisitionWorkerContext, installerResolver: GlobalInstallerResolver): Promise<IDotnetAcquireResult>
    {
        this.globalResolver = installerResolver;
        return this.acquire(context, 'sdk', installerResolver);
    }

    public async acquireLocalASPNET(context: IAcquisitionWorkerContext, invoker : IAcquisitionInvoker)
    {
        return this.acquire(context, 'aspnetcore', undefined, invoker);
    }

    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    public async acquireRuntime(context: IAcquisitionWorkerContext, invoker : IAcquisitionInvoker): Promise<IDotnetAcquireResult> {
        return this.acquire(context, 'runtime', undefined, invoker);
    }

    /**
     *
     * @param version The version of the runtime or sdk to check
     * @param installRuntime Whether this is a local runtime status check or a local SDK status check.
     * @param architecture The architecture of the install. Undefined means it will be the default arch, which is the node platform arch.
     * @returns The result of the install with the path to dotnet if installed, else undefined.
     */
    public async acquireStatus(context: IAcquisitionWorkerContext, installMode: DotnetInstallMode, architecture? : string): Promise<IDotnetAcquireResult | undefined>
    {
        const version = context.acquisitionContext.version!;
        const install = GetDotnetInstallInfo(version, installMode, 'local',
            architecture ? architecture : context.acquisitionContext.architecture ?? this.getDefaultInternalArchitecture(context.acquisitionContext.architecture))

        const existingAcquisitionPromise = InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getPromise(install);
        if (existingAcquisitionPromise)
        {
            // Requested version is being acquired
            context.eventStream.post(new DotnetAcquisitionStatusResolved(install, version));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        }

        const dotnetInstallDir = context.installDirectoryProvider.getInstallDir(install.installKey);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);
        const installedVersions = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getExistingInstalls(true);

        if (installedVersions.some(x => IsEquivalentInstallationFile(x.dotnetInstall, install)) && (fs.existsSync(dotnetPath) || this.usingNoInstallInvoker ))
        {
            // Requested version has already been installed.
            context.eventStream.post(new DotnetAcquisitionStatusResolved(install, version));
            return { dotnetPath };
        }
        else if(installedVersions.length === 0 && fs.existsSync(dotnetPath) && installMode === 'sdk')
        {
            // The education bundle already laid down a local install, add it to our managed installs
            const preinstalledVersions = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).checkForUnrecordedLocalSDKSuccessfulInstall(
                context, dotnetInstallDir, installedVersions);
            if (preinstalledVersions.some(x => IsEquivalentInstallationFile(x.dotnetInstall, install)) &&
                (fs.existsSync(dotnetPath) || this.usingNoInstallInvoker ))
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
        globalInstallerResolver : GlobalInstallerResolver | null = null, localInvoker? : IAcquisitionInvoker): Promise<IDotnetAcquireResult>
    {
        if(globalInstallerResolver !== null)
        {
            context.acquisitionContext.version = await globalInstallerResolver.getFullySpecifiedVersion();
        }
        const version = context.acquisitionContext.version;
        let install = GetDotnetInstallInfo(version, mode, globalInstallerResolver !== null ? 'global' : 'local',
            context.acquisitionContext.architecture ?? this.getDefaultInternalArchitecture(context.acquisitionContext.architecture));

        // Allow for the architecture to be null, which is a legacy behavior.
        if(context.acquisitionContext.architecture === null && context.acquisitionContext.architecture !== undefined)
        {
            install =
            {
                installKey: DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(version, context.acquisitionContext.architecture,
                    context.acquisitionContext.mode!, globalInstallerResolver !== null ? 'global' : 'local'),
                version: install.version,
                isGlobal: install.isGlobal,
                installMode: mode,
            } as DotnetInstall
        }

        context.eventStream.post(new DotnetInstallKeyCreatedEvent(`The requested version ${version} is now marked under the install: ${JSON.stringify(install)}.`));
        const existingAcquisitionPromise = InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getPromise(install);
        if (existingAcquisitionPromise)
        {
            // This version of dotnet is already being acquired. Memoize the promise.
            context.eventStream.post(new DotnetAcquisitionInProgress(install,
                    (context.acquisitionContext && context.acquisitionContext.requestingExtensionId)
                    ? context.acquisitionContext.requestingExtensionId : null));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        }
        else
        {
            // We're the only one acquiring this version of dotnet, start the acquisition process.
            let acquisitionPromise = null;
            if(globalInstallerResolver !== null)
            {
                Debugging.log(`The Acquisition Worker has Determined a Global Install was requested.`, context.eventStream);

                acquisitionPromise = this.acquireGlobalCore(context, globalInstallerResolver, install).catch(async (error: any) =>
                {
                    await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).untrackInstallingVersion(context, install);
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
            await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).addPromise(install, acquisitionPromise);
            return acquisitionPromise.then((res) => ({ dotnetPath: res }));
        }
    }

    public static getInstallKeyCustomArchitecture(version : string, architecture: string | null | undefined, mode: DotnetInstallMode,
        installType : DotnetInstallType = 'local') : string
    {
        if(architecture === null || architecture === 'null')
        {
            // Use the legacy method (no architecture) of installs
            return installType === 'global' ? `${version}-global` : version;
        }
        else if(architecture === undefined)
        {
            architecture = DotnetCoreAcquisitionWorker.defaultArchitecture();
        }

        return installType === 'global' ? `${version}-global~${architecture}` : `${version}~${architecture}`;
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
    private async acquireLocalCore(context: IAcquisitionWorkerContext, mode: DotnetInstallMode, install : DotnetInstall, acquisitionInvoker : IAcquisitionInvoker): Promise<string>
    {
        const version = context.acquisitionContext.version!;
        this.checkForPartialInstalls(context, install);

        let installedVersions = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getExistingInstalls(true);
        const dotnetInstallDir = context.installDirectoryProvider.getInstallDir(install.installKey);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);

        if (fs.existsSync(dotnetPath) && installedVersions.length === 0) {
            // The education bundle already laid down a local install, add it to our managed installs
            installedVersions = await InstallTrackerSingleton.getInstance(context.eventStream,
                context.extensionState).checkForUnrecordedLocalSDKSuccessfulInstall(context, dotnetInstallDir, installedVersions);
        }

        if (installedVersions.some(x => IsEquivalentInstallation(x.dotnetInstall, install) && (fs.existsSync(dotnetPath) || this.usingNoInstallInvoker)))
        {
            // Version requested has already been installed.
            // We don't do this check with global acquisition, since external sources can more easily tamper with installs.
            context.installationValidator.validateDotnetInstall(install, dotnetPath);

            context.eventStream.post(new DotnetAcquisitionAlreadyInstalled(install,
                (context.acquisitionContext && context.acquisitionContext.requestingExtensionId)
                ? context.acquisitionContext.requestingExtensionId : null));

            await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).trackInstalledVersion(context, install);
            return dotnetPath;
        }

        // We update the extension state to indicate we're starting a .NET Core installation.
        await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).trackInstallingVersion(context, install);

        const installContext = {
            installDir: dotnetInstallDir,
            version,
            dotnetPath,
            timeoutSeconds: context.timeoutSeconds,
            installMode : mode,
            installType : context.acquisitionContext.installType ?? 'local', // Before this API param existed, all calls were for local types.
            architecture: context.acquisitionContext.architecture ?? this.getDefaultInternalArchitecture(context.acquisitionContext.architecture),
        } as IDotnetInstallationContext;
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

    private async checkForPartialInstalls(context: IAcquisitionWorkerContext, installKey : DotnetInstall)
    {
        const installingVersions = await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getExistingInstalls(false);
        const partialInstall = installingVersions.some(x => x.dotnetInstall.installKey === installKey.installKey);

        // Don't count it as partial if the promise is still being resolved.
        // The promises get wiped out upon reload, so we can check this.
        if (partialInstall && InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).getPromise(installKey) === null)
        {
            // Partial install, we never updated our extension to no longer be 'installing'. Maybe someone killed the vscode process or we failed in an unexpected way.
            context.eventStream.post(new DotnetAcquisitionPartialInstallation(installKey));

            // Delete the existing local files so we can re-install. For global installs, let the installer handle it.
            await this.uninstallLocalRuntimeOrSDK(context, installKey);
        }
    }

    public async tryCleanUpInstallGraveyard(context: IAcquisitionWorkerContext) : Promise<void>
    {
        const graveyard = new InstallationGraveyard(context);
        const installsToRemove = await graveyard.get();
        for(const install of installsToRemove)
        {
            context.eventStream.post(new DotnetInstallGraveyardEvent(
                `Attempting to remove .NET at ${JSON.stringify(install)} again, as it was left in the graveyard.`));
            await this.uninstallLocalRuntimeOrSDK(context, install);
        }
    }

    private getDefaultInternalArchitecture(existingArch : string | null | undefined)
    {
        if(existingArch !== null && existingArch !== undefined)
        {
            return existingArch;
        }
        if(existingArch === null)
        {
            return 'null';
        }
        return DotnetCoreAcquisitionWorker.defaultArchitecture();
    }

    public static defaultArchitecture() : string
    {
        return os.arch();
    }

    private getErrorOrStringAsEventError(error : any)
    {
        if(error instanceof EventBasedError || error instanceof EventCancellationError)
        {
            error.message = `.NET Acquisition Failed: ${error.message}`;
            return error;
        }
        else
        {
            const newError = new EventBasedError('DotnetAcquisitionError', `.NET Acquisition Failed: ${error?.message ?? error}`);
            return newError;
        }
    }

    private async acquireGlobalCore(context: IAcquisitionWorkerContext, globalInstallerResolver : GlobalInstallerResolver, install : DotnetInstall): Promise<string>
    {
        const installingVersion = await globalInstallerResolver.getFullySpecifiedVersion();
        context.eventStream.post(new DotnetGlobalVersionResolutionCompletionEvent(`The version we resolved that was requested is: ${installingVersion}.`));
        this.checkForPartialInstalls(context, install);

        const installer : IGlobalInstaller = os.platform() === 'linux' ?
            new LinuxGlobalInstaller(context, this.utilityContext, installingVersion) :
            new WinMacGlobalInstaller(context, this.utilityContext, installingVersion, await globalInstallerResolver.getInstallerUrl(), await globalInstallerResolver.getInstallerHash());

        await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).trackInstallingVersion(context, install);
        context.eventStream.post(new DotnetAcquisitionStarted(install, installingVersion, context.acquisitionContext.requestingExtensionId));

        // See if we should return a fake path instead of running the install
        if(process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH && process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH === 'true')
        {
            context.eventStream.post(new DotnetFakeSDKEnvironmentVariableTriggered(`VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH has been set.`));
            return 'fake-sdk';
        }

        context.eventStream.post(new DotnetBeginGlobalInstallerExecution(`Beginning to run installer for ${JSON.stringify(install)} in ${os.platform()}.`))
        const installerResult = await installer.installSDK(install);
        context.eventStream.post(new DotnetCompletedGlobalInstallerExecution(`Completed installer for ${JSON.stringify(install)} in ${os.platform()}.`))

        if(installerResult !== '0')
        {
            const err = new DotnetNonZeroInstallerExitCodeError(new EventBasedError('DotnetNonZeroInstallerExitCodeError',
                `An error was raised by the .NET SDK installer. The exit code it gave us: ${installerResult}`), install);
            context.eventStream.post(err);
            throw err;
        }

        const installedSDKPath : string = await installer.getExpectedGlobalSDKPath(installingVersion,
            context.acquisitionContext.architecture ?? this.getDefaultInternalArchitecture(context.acquisitionContext.architecture));

        TelemetryUtilities.setDotnetSDKTelemetryToMatch(context.isExtensionTelemetryInitiallyEnabled, this.extensionContext, context, this.utilityContext);

        context.installationValidator.validateDotnetInstall(install, installedSDKPath, os.platform() !== 'win32');

        context.eventStream.post(new DotnetAcquisitionCompleted(install, installedSDKPath, installingVersion));

        await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).reclassifyInstallingVersionToInstalled(context, install);

        context.eventStream.post(new DotnetGlobalAcquisitionCompletionEvent(`The version ${JSON.stringify(install)} completed successfully.`));
        return installedSDKPath;
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
    private async removeMatchingLegacyInstall(context: IAcquisitionWorkerContext, installedVersions : InstallRecord[], version : string)
    {
        const legacyInstalls = this.existingLegacyInstalls(context, installedVersions);
        for(const legacyInstall of legacyInstalls)
        {
            if(legacyInstall.dotnetInstall.installKey.includes(version))
            {
                context.eventStream.post(new DotnetLegacyInstallRemovalRequestEvent(`Trying to remove legacy install: ${legacyInstall} of ${version}.`));
                await this.uninstallLocalRuntimeOrSDK(context, legacyInstall.dotnetInstall);
            }
        }
    }

    /**
     *
     * @param allInstalls all of the existing installs.
     * @returns All existing installs made by the extension that don't include a - for the architecture. Not all of the ones which use a string type.
     */
    private existingLegacyInstalls(context: IAcquisitionWorkerContext, allInstalls : InstallRecord[]) : InstallRecord[]
    {
        let legacyInstalls : InstallRecord[] = [];
        for(const install of allInstalls)
        {
            // Assumption: .NET versions so far did not include ~ in them, but we do for our non-legacy keys.
            if(!install.dotnetInstall.installKey.includes('~'))
            {
                context.eventStream.post(new DotnetLegacyInstallDetectedEvent(`A legacy install was detected -- ${JSON.stringify(install)}.`));
                legacyInstalls = legacyInstalls.concat(install);
            }
        }
        return legacyInstalls;
    }


    public async uninstallLocalRuntimeOrSDK(context: IAcquisitionWorkerContext, install : DotnetInstall)
    {
        if(install.isGlobal)
        {
            return;
        }

        try
        {
            const dotnetInstallDir = context.installDirectoryProvider.getInstallDir(install.installKey);
            const graveyard = new InstallationGraveyard(context);

            graveyard.add(install, dotnetInstallDir);
            context.eventStream.post(new DotnetInstallGraveyardEvent(`Attempting to remove .NET at ${install} in path ${dotnetInstallDir}`));

            this.removeFolderRecursively(context.eventStream, dotnetInstallDir);

            await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).untrackInstalledVersion(context, install);
            // this is the only place where installed and installing could deal with pre existing installing key
            await InstallTrackerSingleton.getInstance(context.eventStream, context.extensionState).untrackInstallingVersion(context, install);

            graveyard.remove(install);
            context.eventStream.post(new DotnetInstallGraveyardEvent(`Success at uninstalling ${JSON.stringify(install)} in path ${dotnetInstallDir}`));
        }
        catch(error : any)
        {
            context.eventStream.post(new SuppressedAcquisitionError(error, `The attempt to uninstall .NET ${install} failed - was .NET in use?`))
        }
    }


    private removeFolderRecursively(eventStream: IEventStream, folderPath: string) {
        eventStream.post(new DotnetAcquisitionDeletion(folderPath));
        try
        {
            fs.chmodSync(folderPath, 0o744);
        }
        catch(error : any)
        {
            eventStream.post(new SuppressedAcquisitionError(error, `Failed to chmod +x on .NET folder ${folderPath} when marked for deletion.`));
        }

        try
        {
            rimraf.sync(folderPath);
        }
        catch(error : any)
        {
            eventStream.post(new SuppressedAcquisitionError(error, `Failed to delete .NET folder ${folderPath} when marked for deletion.`));
        }
    }
}

