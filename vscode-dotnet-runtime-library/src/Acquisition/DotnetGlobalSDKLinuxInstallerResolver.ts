import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { Ubuntu22_04DotnetSDKProvider as GenericDistroSDKProvider } from './Ubuntu22_04DotnetSDKProvider';
import * as proc from 'child_process';


/**
 * An enumeration type representing all distros with their versions that we recognize.
 * @remarks
 * Each . in a semver should be represented with _.
 * The string representation of the enum should contain exactly one space that separates the distro, then the version.
 */
export interface distroVersionPair {
    [distro: string]: string;
 }

/**
 * This class is responsible for detecting the distro and version of the Linux OS.
 * It also serves as the entry point to installation via a specific distro implementation
 * by implementing version validation that normally happens inside of a windows or mac .net installer.
 * Since those don't exist for linux, we need to manually implement and check certain edge-cases before allowing the installation to occur.
 */
export class DotnetGlobalSDKLinuxInstallerResolver {
    private distro : distroVersionPair = {};
    public readonly distroSDKProvider: IDistroDotnetSDKProvider;

    constructor() {
        this.distro = this.getRunningDistro();
        this.distroSDKProvider = this.DistroProviderFactory(this.distro);
    }

    private getRunningDistro() : distroVersionPair
    {
        const commandResult = proc.spawnSync('cat', ['/etc/os-release']);
        const distroNameKey = 'NAME';
        const distroVersionKey = 'VERSION_ID';
        let distroName = '';
        let distroVersion = '';

        let pair : distroVersionPair = {};
        pair = { distroName : distroVersion};
        return pair;
    }


    private DistroProviderFactory(distroAndVersion : distroVersionPair) : IDistroDotnetSDKProvider
    {
        switch(distroAndVersion)
        {
            // Implement any custom logic for a Distro Class in a new DistroSDKProvider and add it to the factory here.
            default:
                return new GenericDistroSDKProvider(this.distro);
        }
    }

    private async ValidateVersionFeatureBand(version : string, existingGlobalDotnetVersion : string)
    {


    }

    public async ValidateAndInstallSDK(fullySpecifiedDotnetVersion : string) : Promise<string>
    {
        if (!( await this.distroSDKProvider.isDotnetVersionSupported(fullySpecifiedDotnetVersion) ))
        {
            throw new Error(`The distro ${this.distro} does not officially support dotnet version ${fullySpecifiedDotnetVersion}.`);
        }

        const existingInstall = this.distroSDKProvider.getInstalledGlobalDotnetPathIfExists();

        return '1';
    }

}
