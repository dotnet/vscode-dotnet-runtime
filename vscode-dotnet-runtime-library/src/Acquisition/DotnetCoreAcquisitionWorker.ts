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
import { GetDotnetInstallInfo, getArchFromLegacyInstallKey, getVersionFromLegacyInstallKey, InstallRecord, DotnetInstall, InProgressInstallManager, DotnetInstallOrStr, InstallOwner, InstallRecordOrStr, isGlobalLegacyInstallKey, isRuntimeInstallKey, installKeyStringToDotnetInstall, IsEquivalentInstallationFile } from './IInstallationRecord';
import { InstallationGraveyard } from './InstallationGraveyard';
/* tslint:disable:no-any */

export class DotnetCoreAcquisitionWorker implements IDotnetCoreAcquisitionWorker
{
    private readonly installingVersionsKey = 'installing';
    private readonly installedVersionsKey = 'installed';

    public installingArchitecture : string | null;
    private readonly dotnetExecutable: string;
    private globalResolver: GlobalInstallerResolver | null;

    private acquisitionPromises: InProgressInstallManager;
    private graveyard : InstallationGraveyard;
    private extensionContext : IVSCodeExtensionContext;

    // @member usingNoInstallInvoker - Only use this for test when using the No Install Invoker to fake the worker into thinking a path is on disk.
    protected usingNoInstallInvoker = false;

    constructor(protected readonly context: IAcquisitionWorkerContext, private readonly utilityContext : IUtilityContext, extensionContext : IVSCodeExtensionContext) {
        const dotnetExtension = os.platform() === 'win32' ? '.exe' : '';
        this.graveyard = new InstallationGraveyard(context);
        this.dotnetExecutable = `dotnet${dotnetExtension}`;
        this.acquisitionPromises = new InProgressInstallManager();
        // null deliberately allowed to use old behavior below
        this.installingArchitecture = this.context.installingArchitecture === undefined ? os.arch() : this.context.installingArchitecture;
        this.globalResolver = null;
        this.extensionContext = extensionContext;
    }

    public async uninstallAll() {
        this.context.eventStream.post(new DotnetUninstallAllStarted());
        this.acquisitionPromises.clear();

        this.removeFolderRecursively(this.context.installDirectoryProvider.getStoragePath());

        // This does not uninstall global things yet, so don't remove their keys.
        // todo wrapper around this to auto update existing keys to new type
        const installingVersions = this.getExistingInstalls(false);
        const remainingInstallingVersions = installingVersions.filter(x => x.dotnetInstall.isGlobal);
        await this.context.extensionState.update(this.installingVersionsKey, remainingInstallingVersions);

        const installedVersions = this.getExistingInstalls(true);
        const remainingInstalledVersions = installedVersions.filter(x => x.dotnetInstall.isGlobal);
        await this.context.extensionState.update(this.installedVersionsKey, remainingInstalledVersions);

        this.context.eventStream.post(new DotnetUninstallAllCompleted());
    }

    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    public async acquireSDK(version: string, invoker : IAcquisitionInvoker): Promise<IDotnetAcquireResult> {
        return this.acquire(version, false, undefined, invoker);
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
    public async acquireRuntime(version: string, invoker : IAcquisitionInvoker): Promise<IDotnetAcquireResult> {
        return this.acquire(version, true, undefined, invoker);
    }

    /**
     *
     * @param version The version of the runtime or sdk to check
     * @param installRuntime Whether this is a local runtime status check or a local SDK status check.
     * @param architecture The architecture of the install. Undefined means it will be the default arch, which is the node platform arch.
     * @returns The result of the install with the path to dotnet if installed, else undefined.
     */
    public async acquireStatus(version: string, installRuntime: boolean, architecture? : string): Promise<IDotnetAcquireResult | undefined>
    {
        const installKey = GetDotnetInstallInfo(version, installRuntime, false, architecture ? architecture : this.installingArchitecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture())

        const existingAcquisitionPromise = this.acquisitionPromises.getPromise(installKey);
        if (existingAcquisitionPromise) {
            // Requested version is being acquired
            this.context.eventStream.post(new DotnetAcquisitionStatusResolved(installKey, version));
            return existingAcquisitionPromise.then((res) => ({ dotnetPath: res }));
        }

        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(installKey.installKey);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);
        let installedVersions = this.getExistingInstalls(true);

        if (installedVersions.length === 0 && fs.existsSync(dotnetPath) && !installRuntime)
        {
            // The education bundle already laid down a local install, add it to our managed installs
            installedVersions = await this.checkForUnrecordedLocalSDKSuccessfulInstall(dotnetInstallDir, installedVersions);
        }

        if (installedVersions.some(x => IsEquivalentInstallationFile(x.dotnetInstall, installKey)) && (fs.existsSync(dotnetPath) || this.usingNoInstallInvoker ))
        {
            // Requested version has already been installed. But we don't want to add a ref count, since we are just checking the status.
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
    private async acquire(version: string, installRuntime: boolean, globalInstallerResolver : GlobalInstallerResolver | null = null, localInvoker? : IAcquisitionInvoker): Promise<IDotnetAcquireResult>
    {
        const installKey = GetDotnetInstallInfo(version, installRuntime, globalInstallerResolver !== null, this.installingArchitecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture());
        this.context.eventStream.post(new DotnetInstallKeyCreatedEvent(`The requested version ${version} is now marked under the install key: ${installKey}.`));
        const existingAcquisitionPromise = this.acquisitionPromises.getPromise(installKey);
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
                    this.removeVersionFromExtensionState(this.installingVersionsKey, installKey);
                    this.acquisitionPromises.remove(installKey);
                    error.message = `.NET Acquisition Failed: ${error.message}`;
                    throw error;
                });
            }
            else
            {
                Debugging.log(`The Acquisition Worker has Determined a Local Install was requested.`, this.context.eventStream);

                acquisitionPromise = this.acquireLocalCore(version, installRuntime, installKey, localInvoker!).catch((error: Error) => {
                    this.removeVersionFromExtensionState(this.installingVersionsKey, installKey);
                    this.acquisitionPromises.remove(installKey);
                    error.message = `.NET Acquisition Failed: ${error.message}`;
                    throw error;
                });
            }

            // Put this promise into the list so we can let other requests run at the same time
            // Allows us to return the end result of this current request for any following duplicates while we are still running.
            this.acquisitionPromises.add(installKey, acquisitionPromise);
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
    private async acquireLocalCore(version: string, installRuntime: boolean, installKey : DotnetInstall, acquisitionInvoker : IAcquisitionInvoker): Promise<string>
    {
        this.checkForPartialInstalls(installKey);

        let installedVersions = this.getExistingInstalls(true);
        const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(installKey.installKey);
        const dotnetPath = path.join(dotnetInstallDir, this.dotnetExecutable);

        if (fs.existsSync(dotnetPath) && installedVersions.length === 0) {
            // The education bundle already laid down a local install, add it to our managed installs
            installedVersions = await this.checkForUnrecordedLocalSDKSuccessfulInstall(dotnetInstallDir, installedVersions);
        }

        if (installedVersions.some(x => x.dotnetInstall.installKey == installKey.installKey) && (fs.existsSync(dotnetPath) || this.usingNoInstallInvoker)) {
            // Version requested has already been installed.
            // We don't do this check with global acquisition, since external sources can more easily tamper with installs.
            this.context.installationValidator.validateDotnetInstall(installKey.installKey, dotnetPath);

            this.context.eventStream.post(new DotnetAcquisitionAlreadyInstalled(installKey,
                (this.context.acquisitionContext && this.context.acquisitionContext.requestingExtensionId)
                ? this.context.acquisitionContext!.requestingExtensionId : null));

            this.addVersionToExtensionState(this.installedVersionsKey, installKey);
            return dotnetPath;
        }

        // We update the extension state to indicate we're starting a .NET Core installation.
        await this.addVersionToExtensionState(this.installingVersionsKey, installKey);

        const installContext = {
            installDir: dotnetInstallDir,
            version,
            dotnetPath,
            timeoutSeconds: this.context.timeoutSeconds,
            installRuntime,
            architecture: this.installingArchitecture
        } as IDotnetInstallationContext;
        this.context.eventStream.post(new DotnetAcquisitionStarted(installKey, version, this.context.acquisitionContext?.requestingExtensionId));
        await acquisitionInvoker.installDotnet(installContext, installKey).catch((reason) => {
            throw Error(`Installation failed: ${reason}`);
        });
        this.context.installationValidator.validateDotnetInstall(installKey.installKey, dotnetPath);

        await this.removeMatchingLegacyInstall(installedVersions, version);
        await this.tryCleanUpInstallGraveyard();

        await this.removeVersionFromExtensionState(this.installingVersionsKey, installKey);
        await this.addVersionToExtensionState(this.installedVersionsKey, installKey);

        this.acquisitionPromises.remove(installKey);
        return dotnetPath;
    }

    private async checkForPartialInstalls(installKey : DotnetInstall)
    {
        const installingVersions = this.getExistingInstalls(false);
        const partialInstall = installingVersions.some(x => x.dotnetInstall.installKey === installKey.installKey);

        if (partialInstall && this.acquisitionPromises.getPromise(installKey) === null) // the promises get wiped out upon reload, so we can check this.
        {
            // Partial install, we never updated our extension to no longer be 'installing'. Maybe someone killed the vscode process or we failed in an unexpected way.
            this.context.eventStream.post(new DotnetAcquisitionPartialInstallation(installKey));

            // Delete the existing local files so we can re-install. For global installs, let the installer handle it.
            await this.uninstallLocalRuntimeOrSDK(installKey);
        }
    }

    public async tryCleanUpInstallGraveyard() : Promise<void>
    {
        for(const installKey of this.graveyard)
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

    private async acquireGlobalCore(globalInstallerResolver : GlobalInstallerResolver, installKey : DotnetInstall): Promise<string>
    {
        const installingVersion = await globalInstallerResolver.getFullySpecifiedVersion();
        this.context.eventStream.post(new DotnetGlobalVersionResolutionCompletionEvent(`The version we resolved that was requested is: ${installingVersion}.`));
        this.checkForPartialInstalls(installKey);

        const installer : IGlobalInstaller = os.platform() === 'linux' ?
            new LinuxGlobalInstaller(this.context, this.utilityContext, installingVersion) :
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
        this.context.eventStream.post(new DotnetCompletedGlobalInstallerExecution(`Completed installer for ${installKey} in ${os.platform()}.`))

        if(installerResult !== '0')
        {
            const err = new DotnetNonZeroInstallerExitCodeError(new Error(`An error was raised by the .NET SDK installer. The exit code it gave us: ${installerResult}`), installKey);
            this.context.eventStream.post(err);
            throw err;
        }

        const installedSDKPath : string = await installer.getExpectedGlobalSDKPath(installingVersion, DotnetCoreAcquisitionWorker.defaultArchitecture());

        TelemetryUtilities.setDotnetSDKTelemetryToMatch(this.context.isExtensionTelemetryInitiallyEnabled, this.extensionContext, this.context, this.utilityContext);

        this.context.installationValidator.validateDotnetInstall(installingVersion, installedSDKPath, os.platform() !== 'win32');

        this.context.eventStream.post(new DotnetAcquisitionCompleted(installKey, installedSDKPath, installingVersion));

        // Remove the indication that we're installing and replace it notifying of the real installation completion.
        await this.removeVersionFromExtensionState(this.installingVersionsKey, installKey);
        await this.addVersionToExtensionState(this.installedVersionsKey, installKey);

        this.context.eventStream.post(new DotnetGlobalAcquisitionCompletionEvent(`The version ${installKey} completed successfully.`));
        this.acquisitionPromises.remove(installKey);
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


    public async uninstallLocalRuntimeOrSDK(installKey : DotnetInstall)
    {
        if(installKey.isGlobal)
        {
            return;
        }

        try
        {
            this.acquisitionPromises.remove(installKey);
            const dotnetInstallDir = this.context.installDirectoryProvider.getInstallDir(installKey.installKey);

            this.graveyard.add(installKey, dotnetInstallDir);
            this.context.eventStream.post(new DotnetInstallGraveyardEvent(`Attempting to remove .NET at ${installKey} in path ${dotnetInstallDir}`));

            this.removeFolderRecursively(dotnetInstallDir);

            await this.removeVersionFromExtensionState(this.installedVersionsKey, installKey);
            // this is the only place where installed and installing could deal with pre existing installing key
            await this.removeVersionFromExtensionState(this.installingVersionsKey, installKey);

            this.graveyard.remove(installKey);
            this.context.eventStream.post(new DotnetInstallGraveyardEvent(`Success at uninstalling ${installKey} in path ${dotnetInstallDir}`));
        }
        catch(error : any)
        {
            this.context.eventStream.post(new SuppressedAcquisitionError(error, `The attempt to uninstall .NET ${installKey} failed - was .NET in use?`))
        }
    }

    /**
     *
     * @param getAlreadyInstalledVersions - Whether to get the versions that are already installed. If true, gets installed, if false, gets what's still being installed / installing.
     */
    private getExistingInstalls(getAlreadyInstalledVersions : boolean) : InstallRecord[]
    {
        const extensionStateAccessor = getAlreadyInstalledVersions ? this.installedVersionsKey : this.installingVersionsKey;
        const existingInstalls = this.context.extensionState.get<InstallRecordOrStr[]>(extensionStateAccessor, []);
        const convertedInstalls : InstallRecord[] = [];

        existingInstalls.forEach(install =>
        {
            if(typeof install === 'string')
            {
                convertedInstalls.push(
                    {
                        dotnetInstall: installKeyStringToDotnetInstall(install),
                        installingExtensions: [ null ],
                    } as InstallRecord
                );
            }
            else
            {
                convertedInstalls.push(install);
            }
        });

        this.context.extensionState.update(extensionStateAccessor, convertedInstalls);
        return convertedInstalls;
    }

    private async removeVersionFromExtensionState(key: string, installKey: DotnetInstall) {
        const existingInstalls = this.getExistingInstalls(key === this.installedVersionsKey);
        const installRecord = existingInstalls.filter(x => x.dotnetInstall === (installKey));

        if(installRecord)
        {
            if(installRecord.length > 1)
            {
                // todo: event stream report that this happened it is very weird
            }

            const preExistingRecord = installRecord.at(0);
            const owners = preExistingRecord?.installingExtensions.filter(x => x !== this.context.acquisitionContext?.requestingExtensionId);
            if(!owners)
            {
                // There are no more references/extensions that depend on this install, so remove the install from the list entirely.
                // For installing versions, there should only ever be 1 owner.
                // For installed versions, there can be N owners.
                await this.context.extensionState.update(key, existingInstalls.filter(x => x.dotnetInstall !== (installKey)));
            }
            else
            {
                // There are still other extensions that depend on this install, so merely remove this requesting extension from the list of owners.
                await this.context.extensionState.update(key, existingInstalls.map(x => x.dotnetInstall === (installKey) ?
                    { dotnetInstall: installKey, installingExtensions: owners } as InstallRecord : x));
            }
        }
    }

    private async addVersionToExtensionState(key: string, installKey: DotnetInstall) {
        const existingVersions = this.getExistingInstalls(key === this.installedVersionsKey);
        const sameInstallManagedByOtherExtensions = existingVersions.find(x => x.dotnetInstall === installKey);

        const installOwners = sameInstallManagedByOtherExtensions ? sameInstallManagedByOtherExtensions.installingExtensions.concat(
            this.context.acquisitionContext?.requestingExtensionId ?? null) : [ this.context.acquisitionContext?.requestingExtensionId ?? null ];

        existingVersions.push(
            {
                dotnetInstall: installKey,
                installingExtensions: installOwners
            } as InstallRecord
        );

        await this.context.extensionState.update(key, existingVersions);
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

    // todo: this is called in the global code. Do we actually want that?
    private async checkForUnrecordedLocalSDKSuccessfulInstall(dotnetInstallDir: string, installedInstallKeys: InstallRecord[]): Promise<InstallRecord[]>
    {
        let localSDKDirectoryKeyIter = '';
        try
        {
            // Determine installed version(s) of local SDKs for the EDU bundle.
            const installKeys = fs.readdirSync(path.join(dotnetInstallDir, 'sdk'));

            // Update extension state
            for (const installKey of installKeys)
            {
                localSDKDirectoryKeyIter = installKey;
                const installRecord = GetDotnetInstallInfo(installKey, false, false, DotnetCoreAcquisitionWorker.defaultArchitecture());
                this.context.eventStream.post(new DotnetPreinstallDetected(installRecord));
                await this.addVersionToExtensionState(this.installedVersionsKey, installRecord);
                installedInstallKeys.push({ dotnetInstall: installRecord, installingExtensions: [ null ] } as InstallRecord);
            }
        }
        catch (error)
        {
            this.context.eventStream.post(new DotnetPreinstallDetectionError(error as Error, GetDotnetInstallInfo(localSDKDirectoryKeyIter, false, false,
                DotnetCoreAcquisitionWorker.defaultArchitecture())));
        }
        return installedInstallKeys;
    }


}

