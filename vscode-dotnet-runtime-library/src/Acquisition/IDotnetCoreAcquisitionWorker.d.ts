import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { GlobalSDKInstallerResolver } from './GlobalSDKInstallerResolver';
export interface IDotnetCoreAcquisitionWorker {
    uninstallAll(): void;
    acquireRuntime(version: string): Promise<IDotnetAcquireResult>;
    acquireSDK(version: string): Promise<IDotnetAcquireResult>;
    acquireGlobalSDK(installerResolver: GlobalSDKInstallerResolver): Promise<IDotnetAcquireResult>;
}
