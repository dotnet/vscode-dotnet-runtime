import { DotnetInstallMode } from "./DotnetInstallMode";
import { RuntimeInstallationDirectoryProvider } from "./RuntimeInstallationDirectoryProvider";
import { SdkInstallationDirectoryProvider } from "./SdkInstallationDirectoryProvider";


export function getDirectoryPerMode(mode: DotnetInstallMode, storagePath: string) {
    return mode === 'runtime' ? new RuntimeInstallationDirectoryProvider(storagePath) : new SdkInstallationDirectoryProvider(storagePath);
}
