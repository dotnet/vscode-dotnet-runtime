import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { DotnetDistroSupportStatus } from './DotnetGlobalSDKLinuxInstallerResolver';
export declare class Ubuntu22_04DotnetSDKProvider extends IDistroDotnetSDKProvider {
    installDotnet(installContext: IDotnetInstallationContext): Promise<boolean>;
    getInstalledGlobalDotnetPathIfExists(): Promise<string | null>;
    getExpectedDotnetInstallationDirectory(): Promise<string>;
    dotnetPackageExistsOnSystem(): Promise<boolean>;
    isDotnetVersionSupported(): Promise<boolean>;
    upgradeDotnet(versionToUpgrade: string): Promise<boolean>;
    uninstallDotnet(versionToUninstall: string): Promise<boolean>;
    getInstalledDotnetVersions(): Promise<string[]>;
    getInstalledGlobalDotnetVersionIfExists(): Promise<string | null>;
    getDotnetVersionSupportStatus(fullySpecifiedVersion: string): Promise<DotnetDistroSupportStatus>;
}
