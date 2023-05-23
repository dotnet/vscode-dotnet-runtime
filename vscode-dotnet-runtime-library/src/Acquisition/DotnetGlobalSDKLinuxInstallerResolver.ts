import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { IEventStream } from '../EventStream/EventStream';
import { IExtensionState } from '../IExtensionState';
import { DotnetVersionResolutionError } from '../EventStream/EventStreamEvents';
import { DotnetVersionResolutionCompleted } from '../EventStream/EventStreamEvents';
import * as os from 'os';
import * as cp from 'child_process';
import * as path from 'path';
import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { Ubuntu22_04DotnetSDKProvider } from './Ubuntu22_04DotnetSDKProvider';
import * as proc from 'child_process';
import { GlobalSDKInstallerResolver } from './GlobalSDKInstallerResolver';
import { VersionResolver } from './VersionResolver';

/**
 * An enumeration type representing all distros with their versions that we recognize.
 * @remarks
 * Each . in a semver should be represented with _.
 * The string representation of the enum should contain exactly one space that separates the distro, then the version.
 */
export const enum LinuxDistroVersion {
	Unknown = 'UNKNOWN',
    Ubuntu22_04 = 'UBUNTU 22.04',
    Debian = 'DEBIAN',
    RHEL = 'RHEL',
    CentOS = 'CENTOS',
    Fedora = 'FEDORA'
}

/**
 * @remarks
 * Distro support means that the distro provides a dotnet sdk package by default without intervention.
 *
 * Microsoft support means that Microsoft provides packages for the distro but it's not in the distro maintained feed.
 * For Microsoft support, we currently don't support installs of these feeds yet.
 *
 * Partial support does not have any change in behavior from unsupported currently and can mean whatever the distro maintainer wants.
 * But it generally means that the distro and microsoft both do not officially support that version of dotnet.
 *
 * Unknown is a placeholder for development testing and future potential implementation and should not be used by contributors.
 */
export const enum DotnetDistroSupportStatus {
    Unsupported = 'UNSUPPORTED',
	Distro = 'DISTRO',
    Microsoft = 'MICROSOFT',
    Partial = 'PARTIAL',
    Unknown = 'UNKNOWN'
}

/**
 * This class is responsible for detecting the distro and version of the Linux OS.
 * It also serves as the entry point to installation via a specific distro implementation
 * by implementing version validation that normally happens inside of a windows or mac .net installer.
 * Since those don't exist for linux, we need to manually implement and check certain edge-cases before allowing the installation to occur.
 */
export class DotnetGlobalSDKLinuxInstallerResolver {
    private distro = LinuxDistroVersion.Unknown;
    public readonly distroSDKProvider: IDistroDotnetSDKProvider;

    constructor() {
        this.distro = this.getRunningDistro();
        this.distroSDKProvider = this.DistroProviderFactory(this.distro);
    }

    private getRunningDistro() : LinuxDistroVersion
    {
        const commandResult = proc.spawnSync('cat', ['/etc/os-release']);
        const distroNameKey = 'NAME';
        const distroVersionKey = 'VERSION_ID';
        let distroName = '';
        let distroVersion = '';

        switch(distroName.concat(distroVersion))
        {
            case 'Ubuntu22.04':
                return LinuxDistroVersion.Ubuntu22_04;
            default:
                return LinuxDistroVersion.Unknown;
        }
    }


    private DistroProviderFactory(distroAndVersion : LinuxDistroVersion) : IDistroDotnetSDKProvider
    {
        switch(distroAndVersion)
        {
            case LinuxDistroVersion.Ubuntu22_04:
                return new Ubuntu22_04DotnetSDKProvider();
                break;
            default:
                throw Error(`The distro and version pair ${distroAndVersion} is unrecognized.`);
        }
    }

    private async ValidateVersionFeatureBand(version : string, existingGlobalDotnetVersion : string)
    {


    }

    public async ValidateAndInstallSDK(fullySpecifiedDotnetVersion : string) : Promise<string>
    {
        if (!( await this.distroSDKProvider.isDotnetVersionSupported(fullySpecifiedDotnetVersion) ))
        {
            if ( await this.distroSDKProvider.getDotnetVersionSupportStatus(fullySpecifiedDotnetVersion) === DotnetDistroSupportStatus.Microsoft)
            {
                throw new Error(`The distro ${this.distro} currently only has support for manual installation via Microsoft feeds: https://packages.microsoft.com/.`);
            }
            else
            {
                throw new Error(`The distro ${this.distro} does not officially support dotnet version ${fullySpecifiedDotnetVersion}.`)
            }
        }

        const existingInstall = this.distroSDKProvider.getInstalledGlobalDotnetPathIfExists();

        return '1';
    }

}
