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
    DotnetPreinstallDetected,
    DotnetPreinstallDetectionError,
    DotnetUninstallAllCompleted,
    DotnetUninstallAllStarted,
    DotnetGlobalAcquisitionCompletionEvent,
    DotnetGlobalVersionResolutionCompletionEvent,
    DotnetBeginGlobalInstallerExecution,
    DotnetCompletedGlobalInstallerExecution,
    DotnetFakeSDKEnvironmentVariableTriggered,
    SuppressedAcquisitionError
} from '../EventStream/EventStreamEvents';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetCoreAcquisitionWorker } from './IDotnetCoreAcquisitionWorker';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { GlobalInstallerResolver } from './GlobalInstallerResolver';
import { WinMacGlobalInstaller } from './WinMacGlobalInstaller';
import { IGlobalInstaller } from './IGlobalInstaller';
import { LinuxGlobalInstaller } from './LinuxGlobalInstaller';
import { Debugging } from '../Utils/Debugging';
import { IDotnetAcquireContext} from '../IDotnetAcquireContext';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { TelemetryUtilities } from '../EventStream/TelemetryUtilities';
/* tslint:disable:no-any */

export class DotnetCoreAcquisitionWorker implements IDotnetCoreAcquisitionWorker {
    private readonly installingVersionsKey = 'installing';
    private readonly installedVersionsKey = 'installed';
    // The 'graveyard' includes failed uninstall paths and their install key.
    // These will become marked for attempted 'garbage collection' at the end of every acquisition.
    private readonly installPathsGraveyardKey = 'installPathsGraveyard';
    public installingArchitecture : string | null;
    private readonly dotnetExecutable: string;
    private readonly timeoutValue: number;
    private globalResolver: GlobalInstallerResolver | null;

    private acquisitionPromises: { [installKeys: string]: Promise<string> | undefined };
    private extensionContext : IVSCodeExtensionContext;

    constructor(private readonly context: IAcquisitionWorkerContext, private readonly utilityContext : IUtilityContext, extensionContext : IVSCodeExtensionContext) {
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.timeoutValue = context.timeoutValue;
        this.acquisitionPromises = {};
        // null deliberately allowed to use old behavior below
        this.installingArchitecture = this.context.installingArchitecture === undefined ? os.arch() : this.context.installingArchitecture;
        this.globalResolver = null;
        this.extensionContext = extensionContext;
    }

    public async uninstallAll() {
        this.context.eventStream.post(new DotnetUninstallAllStarted());
        this.acquisitionPromises = {};

        this.removeFolderRecursively(this.context.installDirectoryProvider.getStoragePath());

        await this.context.extensionState.update(this.installingVersionsKey, []);
        await this.context.extensionState.update(this.installedVersionsKey, []);

        this.context.eventStream.post(new DotnetUninstallAllCompleted());
    }

    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    public async acquireSDK(version: string): Promise<IDotnetAcquireResult> {
        return this.acquire(version, false);
    }

    public async acquireGlobalSDK(installerResolver: GlobalInstallerResolver): Promise<IDotnetAcquireResult>
    {
        this.globalResolver = installerResolver;
        return this.acquire(await installerResolver.getFullySpecifiedVersion(), false, installerResolver);
    }

    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    public async acquireRuntime(version: string): Promise<IDotnetAcquireResult> {
        return this.acquire(version, true);
    }

    public async acquireStatus(version: string, installRuntime: boolean, architecture? : string): Promise<IDotnetAcquireResult | undefined> {
        const installKey = DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(version, architecture ? architecture : this.installingArchitecture)

        const existingAcquisitionPromise = this.acquisitionPromises[installKey];
        if (existingAcquisitionPromise) {
            // Requested version is being acquired
            this.context.eventStream.post(new DotnetAcquisitionStatusResolved(installKey, version));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        }

        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(installKey);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);
        let installedVersions = this.context.extensionState.get<string[]>(this.installedVersionsKey, []);

        if (installedVersions.length === 0 && fs.existsSync(dotnetPath) && !installRuntime)
        {
            // The education bundle already laid down a local install, add it to our managed installs
            installedVersions = await this.managePreinstalledVersion(dotnetInstallDir, installedVersions);
        }

        if (installedVersions.includes(installKey) && fs.existsSync(dotnetPath))
        {
            // Requested version has already been installed.
            this.context.eventStream.post(new DotnetAcquisitionStatusResolved(installKey, version));
            return { dotnetPath };
        }

        // Version is not installed
        this.context.eventStream.post(new DotnetAcquisitionStatusUndefined(installKey));
        return undefined;
    }

    /**
     *
     * @param version the version to get of the runtime or sdk.
     * @param installRuntime true for runtime acquisition, false for SDK.
     * @param globalInstallerResolver Create this and add it to install globally.
     * @returns the dotnet acquisition result.
     */
    private async acquire(version: string, installRuntime: boolean, globalInstallerResolver : GlobalInstallerResolver | null = null): Promise<IDotnetAcquireResult>
    {
        const installKey = this.getInstallKey(version);
        this.context.eventStream.post(new DotnetInstallKeyCreatedEvent(`The requested version ${version} is now marked under the install key: ${installKey}.`));
        const existingAcquisitionPromise = this.acquisitionPromises[installKey];
        if (existingAcquisitionPromise)
        {
            // This version of dotnet is already being acquired. Memoize the promise.
            this.context.eventStream.post(new DotnetAcquisitionInProgress(installKey,
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

                acquisitionPromise = this.acquireGlobalCore(globalInstallerResolver, installKey).catch((error: Error) => {
                    delete this.acquisitionPromises[installKey];
                    throw new Error(`.NET Acquisition Failed: ${error.message}`);
                });
            }
            else
            {
                Debugging.log(`The Acquisition Worker has Determined a Local Install was requested.`, this.context.eventStream);

                acquisitionPromise = this.acquireCore(version, installRuntime, installKey).catch((error: Error) => {
                    delete this.acquisitionPromises[installKey];
                    throw new Error(`.NET Acquisition Failed: ${error.message}`);
                });
            }

            this.acquisitionPromises[installKey] = acquisitionPromise;
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
     * @param installKey The install record / key of the version managed by us.
     * @returns the dotnet path of the acquired dotnet.
     *
     * @remarks it is called "core" because it is the meat of the actual acquisition work; this has nothing to do with .NET core vs framework.
     */
    private async acquireCore(version: string, installRuntime: boolean, installKey : string): Promise<string>
    {
        this.checkForPartialInstalls(installKey, version, installRuntime, !installRuntime);

        let installedVersions = this.context.extensionState.get<string[]>(this.installedVersionsKey, []);
        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(installKey);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);

        if (fs.existsSync(dotnetPath) && installedVersions.length === 0) {
            // The education bundle already laid down a local install, add it to our managed installs
            installedVersions = await this.managePreinstalledVersion(dotnetInstallDir, installedVersions);
        }

        if (installedVersions.includes(installKey) && fs.existsSync(dotnetPath)) {
            // Version requested has already been installed.
            this.context.installationValidator.validateDotnetInstall(installKey, dotnetPath);
            this.context.eventStream.post(new DotnetAcquisitionAlreadyInstalled(installKey,
                (this.context.acquisitionContext && this.context.acquisitionContext.requestingExtensionId)
                ? this.context.acquisitionContext!.requestingExtensionId : null));
            return dotnetPath;
        }

        // We update the extension state to indicate we're starting a .NET Core installation.
        await this.addVersionToExtensionState(this.installingVersionsKey, installKey);

        const installContext = {
            installDir: dotnetInstallDir,
            version,
            dotnetPath,
            timeoutValue: this.timeoutValue,
            installRuntime,
            architecture: this.installingArchitecture
        } as IDotnetInstallationContext;
        this.context.eventStream.post(new DotnetAcquisitionStarted(installKey, version, this.context.acquisitionContext?.requestingExtensionId));
        await this.context.acquisitionInvoker.installDotnet(installContext).catch((reason) => {
            throw Error(`Installation failed: ${reason}`);
        });
        this.context.installationValidator.validateDotnetInstall(installKey, dotnetPath);

        await this.removeMatchingLegacyInstall(installedVersions, version);
        await this.tryCleanUpInstallGraveyard();

        await this.removeVersionFromExtensionState(this.installingVersionsKey, installKey);
        await this.addVersionToExtensionState(this.installedVersionsKey, installKey);

        return dotnetPath;
    }

    private async checkForPartialInstalls(installKey : string, version : string, uninstallLocalRuntime : boolean, uninstallLocalSDK : boolean)
    {
        const installingVersions = this.context.extensionState.get<string[]>(this.installingVersionsKey, []);
        const partialInstall = installingVersions.indexOf(installKey) >= 0;
        if (partialInstall)
        {
            // Partial install, we never updated our extension to no longer be 'installing'.
            this.context.eventStream.post(new DotnetAcquisitionPartialInstallation(installKey));

            // Uninstall everything so we can re-install. For global installs, let the installer handle it.
            if(uninstallLocalRuntime)
            {
                await this.uninstallAll();
            }
            if(uninstallLocalSDK)
            {
                await this.uninstallRuntimeOrSDK(installKey);
            }
        }
    }

    private async acquireGlobalCore(globalInstallerResolver : GlobalInstallerResolver, installKey : string): Promise<string>
    {
        const installingVersion = await globalInstallerResolver.getFullySpecifiedVersion();
        this.context.eventStream.post(new DotnetGlobalVersionResolutionCompletionEvent(`The version we resolved that was requested is: ${installingVersion}.`));
        this.checkForPartialInstalls(installKey, installingVersion, false, false);

        const installer : IGlobalInstaller = os.platform() === 'linux' ?
            new LinuxGlobalInstaller(this.context, this.utilityContext, this.context.acquisitionContext!, installingVersion) :
            new WinMacGlobalInstaller(this.context, this.utilityContext, installingVersion, await globalInstallerResolver.getInstallerUrl(), await globalInstallerResolver.getInstallerHash());

        // Indicate that we're beginning to do the install.
        await this.addVersionToExtensionState(this.installingVersionsKey, installKey);
        this.context.eventStream.post(new DotnetAcquisitionStarted(installKey, installingVersion, this.context.acquisitionContext?.requestingExtensionId));

        // See if we should return a fake path instead of running the install
        if(process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH && process.env.VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH === 'true')
        {
            this.context.eventStream.post(new DotnetFakeSDKEnvironmentVariableTriggered(`VSCODE_DOTNET_GLOBAL_INSTALL_FAKE_PATH has been set.`));
            return 'fake-sdk';
        }

        this.context.eventStream.post(new DotnetBeginGlobalInstallerExecution(`Beginning to run installer for ${installKey} in ${os.platform()}.`))
        const installerResult = await installer.installSDK();
        this.context.eventStream.post(new DotnetCompletedGlobalInstallerExecution(`Beginning to run installer for ${installKey} in ${os.platform()}.`))

        if(installerResult !== '0')
        {
            const err = new DotnetNonZeroInstallerExitCodeError(new Error(`An error was raised by the .NET SDK installer. The exit code it gave us: ${installerResult}`));
            this.context.eventStream.post(err);
            throw err;
        }

        const installedSDKPath : string = await installer.getExpectedGlobalSDKPath(installingVersion, os.arch());

        TelemetryUtilities.setDotnetSDKTelemetryToMatch(this.context.isExtensionTelemetryInitiallyEnabled, this.extensionContext, this.context.eventStream, this.utilityContext);

        this.context.installationValidator.validateDotnetInstall(installingVersion, installedSDKPath, os.platform() !== 'win32');

        this.context.eventStream.post(new DotnetAcquisitionCompleted(installKey, installedSDKPath, installingVersion));

        // Remove the indication that we're installing and replace it notifying of the real installation completion.
        await this.removeVersionFromExtensionState(this.installingVersionsKey, installKey);
        await this.addVersionToExtensionState(this.installedVersionsKey, installKey);

        this.context.eventStream.post(new DotnetGlobalAcquisitionCompletionEvent(`The version ${installKey} completed successfully.`));
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
    private async removeMatchingLegacyInstall(installedVersions : string[], version : string)
    {
        const legacyInstalls = this.existingLegacyInstalls(installedVersions);
        for(const legacyInstall of legacyInstalls)
        {
            if(legacyInstall.includes(version))
            {
                this.context.eventStream.post(new DotnetLegacyInstallRemovalRequestEvent(`Trying to remove legacy install: ${legacyInstall} of ${version}.`));
                await this.uninstallRuntimeOrSDK(legacyInstall);
            }
        }
    }

    /**
     *
     * @param allInstalls all of the existing installs.
     * @returns All existing installs made by the extension that don't include a - for the architecture.
     */
    private existingLegacyInstalls(allInstalls : string[]) : string[]
    {
        let legacyInstalls : string[] = [];
        for(const install of allInstalls)
        {
            // Assumption: .NET versions so far did not include ~ in them, but we do for our non-legacy keys.
            if(!install.includes('~'))
            {
                this.context.eventStream.post(new DotnetLegacyInstallDetectedEvent(`A legacy install was detected -- ${install}.`));
                legacyInstalls = legacyInstalls.concat(install);
            }
        }
        return legacyInstalls;
    }

    private async tryCleanUpInstallGraveyard() : Promise<void>
    {
        const graveyard = this.getGraveyard();
        for(const installKey of Object.keys(graveyard))
        {
            this.context.eventStream.post(new DotnetInstallGraveyardEvent(
                `Attempting to remove .NET at ${installKey} again, as it was left in the graveyard.`));
            await this.uninstallRuntimeOrSDK(installKey);
        }
    }

    protected getGraveyard() : { [installKeys: string]: string }
    {
        return this.context.extensionState.get<{ [installKeys: string]: string }>(this.installPathsGraveyardKey, {});
    }

    /**
     *
     * @param newPath Leaving this empty will delete the key from the graveyard.
     */
    protected async updateGraveyard(installKey : string, newPath? : string | undefined)
    {
        const graveyard = this.getGraveyard();
        if(newPath)
        {
            graveyard[installKey] = newPath;
        }
        else
        {
            delete graveyard[installKey];
        }
        await this.context.extensionState.update(this.installPathsGraveyardKey, graveyard);
    }

    public async uninstallRuntimeOrSDK(installKey : string) {
        try
        {
            delete this.acquisitionPromises[installKey];
            const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(installKey);

            this.updateGraveyard(installKey, dotnetInstallDir);
            this.context.eventStream.post(new DotnetInstallGraveyardEvent(`Attempting to remove .NET at ${installKey} in path ${dotnetInstallDir}`));

            this.removeFolderRecursively(dotnetInstallDir);

            await this.removeVersionFromExtensionState(this.installedVersionsKey, installKey);
            await this.removeVersionFromExtensionState(this.installingVersionsKey, installKey);

            this.updateGraveyard(installKey);
            this.context.eventStream.post(new DotnetInstallGraveyardEvent(`Success at uninstalling ${installKey} in path ${dotnetInstallDir}`));
        }
        catch(error : any)
        {
            this.context.eventStream.post(new SuppressedAcquisitionError(error, `The attempt to uninstall .NET ${installKey} failed - was .NET in use?`))
        }
    }

    private async removeVersionFromExtensionState(key: string, installKey: string) {
        const state = this.context.extensionState.get<string[]>(key, []);
        const versionIndex = state.indexOf(installKey);
        if (versionIndex >= 0) {
            state.splice(versionIndex, 1);
            await this.context.extensionState.update(key, state);
        }
    }

    private async addVersionToExtensionState(key: string, installKey: string) {
        const state = this.context.extensionState.get<string[]>(key, []);
        state.push(installKey);
        await this.context.extensionState.update(key, state);
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

    private async managePreinstalledVersion(dotnetInstallDir: string, installedInstallKeys: string[]): Promise<string[]> {
        try {
            // Determine installed version(s)
            const installKeys = fs.readdirSync(path.join(dotnetInstallDir, 'sdk'));

            // Update extension state
            for (const installKey of installKeys) {
                this.context.eventStream.post(new DotnetPreinstallDetected(installKey));
                await this.addVersionToExtensionState(this.installedVersionsKey, installKey);
                installedInstallKeys.push(installKey);
            }
        } catch (error) {
            this.context.eventStream.post(new DotnetPreinstallDetectionError(error as Error));
        }
        return installedInstallKeys;
    }


}

