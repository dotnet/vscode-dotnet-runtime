import { IVersionResolver } from 'vscode-dotnet-runtime-library';
import { WebRequestWorker } from 'vscode-dotnet-runtime-library';
import { IEventStream } from 'vscode-dotnet-runtime-library'
import { IExtensionState } from 'vscode-dotnet-runtime-library';
import { DotnetVersionResolutionError } from 'vscode-dotnet-runtime-library';
import { DotnetVersionResolutionCompleted } from 'vscode-dotnet-runtime-library';
import * as os from 'os';

export class GlobalSDKInstallerUrlResolver {
    /**
     * @remarks
     * This is similar to the version resolver but accepts a wider range of inputs such as '6', '6.1', or '6.0.3xx' or '6.0.301'.
     * It currently only is used for SDK Global acquistion to prevent breaking existing behaviors.
     */
    protected webWorker: WebRequestWorker;
    private readonly releasesKey = 'releases';
    private readonly releasesUrl = 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/releases-index.json';

    constructor(extensionState: IExtensionState,
                private readonly eventStream: IEventStream) {
        this.webWorker = new WebRequestWorker(extensionState, eventStream, this.releasesUrl, this.releasesKey);
    }

    public async getCorrectInstallerUrl(version: string): Promise<string> {
        return this.routeRequestToProperVersionRequestType(version);
    }

    private async routeRequestToProperVersionRequestType(version : string) : Promise<string> {
        /**
         * @remarks TODO: Do we need to support -preview or things with build numbers inside?
         */

        let numberOfPeriods = version.split('.').length - 1;

        // TODO: turn these if conditions into functions with names
        if(this.isNumber(version) && numberOfPeriods == 0)
        {
            // A major release represented as an integer was given. e.g. 6
            // call into releases json and get latest-sdk 
            // call into getinstallerurl
        }
        else if(this.isNumber(version) && numberOfPeriods == 1)
        {
            // A major.minor was given e.g. 6.1
            // call into releases json and get latest-sdk
            // call into get installer url
        }
        else if(version.split(".").slice(0, 2).every(x => this.isNumber(x)) && version.endsWith('x') && numberOfPeriods == 2 && version.length < 9) // 9 is used to prevent bad versions (current expectation is 7 but we want to support .net 10 etc)
        {
            // A feature band was given e.g. 6.0.4xx or 6.0.40x
        }
        else if(version.split(".").every(x => this.isNumber(x)) && numberOfPeriods == 2 && version.length < 9)
        {
            // A specific version e.g. 7.0.301
            // call into get installer url
        }
        throw Error(`The version requested: ${version} is not in a valid format.`)
    }

    private getInstallerUrl(specificVersion : string) : string
    {
        let operatingSys : string = os.platform();
        let operatingArch : string = os.arch();

        let convertedOs = "";
        let convertedArch = "";
        
        switch(operatingSys)
        {
            case 'win32': {
                convertedOs = 'win';
                break;
            }
            case 'darwin': {
                convertedOs = 'osx';
                break;
            }
            case 'linux': {
                convertedOs = operatingSys;
                break;
            }
        }

        switch(operatingArch)
        {
            case 'x64': {
                convertedArch = operatingArch;
                break;
            }
            case 'x32': {
                convertedArch = 'x86';
                break;
            }
            case 'arm': {
                convertedArch = operatingArch;
                break;
            }
            case 'arm64': {
                convertedArch = operatingArch;
                break;
            }
        }

        var desiredRidPackage = convertedOs + '-' + convertedArch;
        // call get major function
        // get releases url
        // get releases.sdks.sdk where sdk.version == fullversion
        // get files 
        // from files get x where x.rid is desiredRidPackage
        // if none found, fail

        return "";
    }

    private createIndexUrl(majorMinor : string ): string
    {
        return 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/' + majorMinor + '/releases.json';
    }

    private isNumber(value: string | number): boolean
    {
        return (
            (value != null) &&
            (value !== '') &&
            !isNaN(Number(value.toString()))
        );
    }
}
