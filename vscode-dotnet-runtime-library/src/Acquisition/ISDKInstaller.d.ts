export declare abstract class ISDKInstaller {
    constructor();
    abstract installSDK(): Promise<string>;
    abstract getExpectedGlobalSDKPath(specificSDKVersionInstalled: string, installedArch: string): Promise<string>;
    abstract getGlobalSdkVersionsInstalledOnMachine(): Promise<Array<string>>;
    /**
     *
     * @returns The folder where global sdk installers will be downloaded onto the disk.
     */
    static getDownloadedInstallFilesFolder(): string;
}
