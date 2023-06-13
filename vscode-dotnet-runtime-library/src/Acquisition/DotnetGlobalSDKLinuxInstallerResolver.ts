import { DotnetAcquisitionDistroUnknownError } from '../EventStream/EventStreamEvents';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IDistroDotnetSDKProvider } from './IDistroDotnetSDKProvider';
import { Ubuntu22_04DotnetSDKProvider as GenericDistroSDKProvider } from './Ubuntu22_04DotnetSDKProvider';
import * as proc from 'child_process';


/**
 * An enumeration type representing all distros with their versions that we recognize.
 * @remarks
 * Each . in a semver should be represented with _.
 * The string representation of the enum should contain exactly one space that separates the distro, then the version.
 */
export interface DistroVersionPair {
    [distro: string]: string;
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
    private distro : DistroVersionPair = {};
    private context : IAcquisitionWorkerContext;
    public readonly distroSDKProvider: IDistroDotnetSDKProvider;

    constructor(context : IAcquisitionWorkerContext) {
        this.context = context;
        this.distro = this.getRunningDistro();
        this.distroSDKProvider = this.DistroProviderFactory(this.distro);
    }


    private static escapeRegExp(str : string)
    {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
      }
      
    private static replaceAll(str : string , find : string, replace : string)
    {
        return str.replace(new RegExp(DotnetGlobalSDKLinuxInstallerResolver.escapeRegExp(find), 'g'), replace);
    }

    private getRunningDistro() : DistroVersionPair
    {
        const commandResult = proc.spawnSync('cat', ['/etc/os-release']);
        const distroNameKey = 'NAME';
        const distroVersionKey = 'VERSION_ID';

        const stdOut = commandResult.stdout.toString().split("\n");
        // We need to remove the quotes from the KEY="VALUE"\n pairs returned by the command stdout, and then turn it into a dictionary. We can't use replaceAll for older browsers.
        // Replace only replaces one quote, so we remove the 2nd one later.
        const stdOutWithQuotesRemoved = stdOut.map( x => x.replace('"', ''));
        const stdOutWithSeparatedKeyValues = stdOutWithQuotesRemoved.map( x => x.split('='));
        const keyValueMap =  Object.fromEntries(stdOutWithSeparatedKeyValues.map(x => [x[0], x[1]]));

        // Remove the 2nd quotes.
        const distroName : string = keyValueMap[distroNameKey]?.replace('"', '') ?? '';
        const distroVersion : string = keyValueMap[distroVersionKey]?.replace('"', '') ?? '';

        if(distroName == '' || distroVersion == '')
        {
            const error = new DotnetAcquisitionDistroUnknownError('We are unable to detect the distro or version of your machine');
            this.eventStream.post();
            throw error;
        }

        let pair : DistroVersionPair = {};
        pair = { distroName : distroVersion };

        
        return pair;
    }


    private DistroProviderFactory(distroAndVersion : DistroVersionPair) : IDistroDotnetSDKProvider
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
