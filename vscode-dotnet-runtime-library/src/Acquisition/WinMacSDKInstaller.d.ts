import { ISDKInstaller } from './ISDKInstaller';
/**
 * @remarks
 * This class manages global .NET SDK installations for windows and mac.
 * Both of these OS's have official installers that we can download and run on the machine.
 * Since Linux does not, it is delegated into its own set of classes.
 */
export declare class WinMacSDKInstaller extends ISDKInstaller {
    private installerUrl;
    constructor(installerUrl: string);
    installSDK(): Promise<string>;
    /**
     *
     * @param installerUrl the url of the installer to download.
     * @returns the path to the installer which was downloaded into a directory managed by us.
     */
    private downloadInstaller;
    private download;
    getExpectedGlobalSDKPath(specificSDKVersionInstalled: string, installedArch: string): Promise<string>;
    /**
     *
     * @param installerPath The path to the installer file to run.
     * @returns The exit result from running the global install.
     */
    executeInstall(installerPath: string): Promise<string>;
    /**
     *
     * @param registryQueryResult the raw output of a registry query converted into a string
     * @returns
     */
    private extractVersionsOutOfRegistryKeyStrings;
    /**
     *
     * @returns an array containing fully specified / specific versions of all globally installed sdks on the machine in windows for 32 and 64 bit sdks.
     * TODO: Expand this function to work with mac.
     */
    getGlobalSdkVersionsInstalledOnMachine(): Promise<Array<string>>;
}
