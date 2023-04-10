import { IVersionResolver } from 'vscode-dotnet-runtime-library';
import { WebRequestWorker } from 'vscode-dotnet-runtime-library';
import { IEventStream } from 'vscode-dotnet-runtime-library'
import { IExtensionState } from 'vscode-dotnet-runtime-library';
import { DotnetVersionResolutionError } from 'vscode-dotnet-runtime-library';
import { DotnetVersionResolutionCompleted } from 'vscode-dotnet-runtime-library';

export class MultiInputVersionResolver implements IVersionResolver {
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

    public async getFullRuntimeVersion(version: string): Promise<string> {
            throw new Error("Not Implemented: Getting the Runtime Version from this format of Versions is not implemented."); 
    }

    public async getFullSDKVersion(version: string): Promise<string> {
        return this.getFullVersion(version);
    }

    private async getFullVersion(version: string): Promise<string> {
        try {
            //const releasesVersions = await this.getReleasesInfo();
            //const versionResult = this.resolveVersion(version, releasesVersions);
            //this.eventStream.post(new DotnetVersionResolutionCompleted(version, versionResult));
            return "";
        } catch (error) {
            this.eventStream.post(new DotnetVersionResolutionError(error as Error, version));
            throw error;
        }
    }
}
