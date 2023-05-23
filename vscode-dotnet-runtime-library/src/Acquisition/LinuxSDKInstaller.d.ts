import { ISDKInstaller } from './ISDKInstaller';
export declare class LinuxSDKInstaller extends ISDKInstaller {
    private version;
    private linuxSDKResolver;
    constructor(fullySpecifiedDotnetVersion: string);
    installSDK(): Promise<string>;
    getExpectedGlobalSDKPath(specificSDKVersionInstalled: string, installedArch: string): Promise<string>;
    getGlobalSdkVersionsInstalledOnMachine(): Promise<string[]>;
}
