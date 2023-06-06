import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
/**
 * An enumeration type representing all distros with their versions that we recognize.
 * @remarks
 * Each . in a semver should be represented with _.
 * The string representation of the enum should contain exactly one space that separates the distro, then the version.
 */
export declare const enum LinuxDistroVersion {
    Unknown = "UNKNOWN",
    Ubuntu22_04 = "UBUNTU 22.04",
    Debian = "DEBIAN",
    RHEL = "RHEL",
    CentOS = "CENTOS",
    Fedora = "FEDORA"
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
export declare const enum DotnetDistroSupportStatus {
    Unsupported = "UNSUPPORTED",
    Distro = "DISTRO",
    Microsoft = "MICROSOFT",
    Partial = "PARTIAL",
    Unknown = "UNKNOWN"
}
/**
 * This class is responsible for detecting the distro and version of the Linux OS.
 * It also serves as the entry point to installation via a specific distro implementation
 * by implementing version validation that normally happens inside of a windows or mac .net installer.
 * Since those don't exist for linux, we need to manually implement and check certain edge-cases before allowing the installation to occur.
 */
export declare class DotnetGlobalSDKLinuxInstallerResolver {
    private distro;
    readonly distroSDKProvider: IDistroDotnetSDKProvider;
    constructor();
    private getRunningDistro;
    private DistroProviderFactory;
    private ValidateVersionFeatureBand;
    ValidateAndInstallSDK(fullySpecifiedDotnetVersion: string): Promise<string>;
}
