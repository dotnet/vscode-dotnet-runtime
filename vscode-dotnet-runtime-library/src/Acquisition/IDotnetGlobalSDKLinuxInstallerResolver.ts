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

export const enum LinuxDistroVersion {
	Unknown = 1,
    Ubuntu22_04 = 2,
    Debian = 2,
	Ubuntu = 3,
    RHEL = 4,
    CentOS = 5,
    Fedora = 6
}


export abstract class IDotnetGlobalSDKLinuxInstallerResolver {
    public readonly distroSDKProvider: IDistroDotnetSDKProvider;

    constructor() {
        const distroAndVersion : LinuxDistroVersion = this.getRunningDistro();
        this.distroSDKProvider = this.DistroProviderFactory(distroAndVersion);
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
                throw Error(`The distro and version ${distroAndVersion} is unrecognized.`);
        }
    }

    public abstract ValidateAndInstallSDK(fullySpecifiedDotnetVersion : string) : Promise<boolean>;

}
