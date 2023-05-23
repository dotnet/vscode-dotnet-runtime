import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDotnetCoreAcquisitionWorker } from './IDotnetCoreAcquisitionWorker';
import { GlobalSDKInstallerResolver } from './GlobalSDKInstallerResolver';
export declare class DotnetCoreAcquisitionWorker implements IDotnetCoreAcquisitionWorker {
    private readonly context;
    private readonly installingVersionsKey;
    private readonly installedVersionsKey;
    private readonly dotnetExecutable;
    private readonly timeoutValue;
    private acquisitionPromises;
    constructor(context: IAcquisitionWorkerContext);
    uninstallAll(): Promise<void>;
    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    acquireSDK(version: string): Promise<IDotnetAcquireResult>;
    acquireGlobalSDK(installerResolver: GlobalSDKInstallerResolver): Promise<IDotnetAcquireResult>;
    /**
     *
     * @remarks this is simply a wrapper around the acquire function.
     * @returns the requested dotnet path.
     */
    acquireRuntime(version: string): Promise<IDotnetAcquireResult>;
    acquireStatus(version: string, installRuntime: boolean): Promise<IDotnetAcquireResult | undefined>;
    /**
     *
     * @param version the version to get of the runtime or sdk.
     * @param installRuntime true for runtime acquisition, false for SDK.
     * @param global false for local install, true for global SDK installs.
     * @returns the dotnet acqusition result.
     */
    private acquire;
    /**
     *
     * @param version The version of the object to acquire.
     * @param installRuntime true if the request is to install the runtime, false for the SDK.
     * @param global false if we're doing a local install, true if we're doing a global install. Only supported for the SDK atm.
     * @returns the dotnet path of the acquired dotnet.
     *
     * @remarks it is called "core" because it is the meat of the actual acquisition work; this has nothing to do with .NET core vs framework.
     */
    private acquireCore;
    private acquireGlobalCore;
    private uninstallRuntime;
    private removeVersionFromExtensionState;
    private addVersionToExtensionState;
    private removeFolderRecursively;
    private managePreinstalledVersion;
}
