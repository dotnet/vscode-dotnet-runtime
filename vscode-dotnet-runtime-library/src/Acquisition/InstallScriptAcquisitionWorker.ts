/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as os from 'os';
import * as path from 'path';
import
{
    DotnetFallbackInstallScriptUsed,
    DotnetInstallScriptAcquisitionCompleted,
    DotnetInstallScriptAcquisitionError,
    EventBasedError,
} from '../EventStream/EventStreamEvents';
import { FileUtilities } from '../Utils/FileUtilities';
import { getInstallFromContext } from '../Utils/InstallIdUtilities';
import { WebRequestWorkerSingleton } from '../Utils/WebRequestWorkerSingleton';

import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';

export class InstallScriptAcquisitionWorker implements IInstallScriptAcquisitionWorker
{
    protected webWorker: WebRequestWorkerSingleton;
    private readonly scriptAcquisitionUrl: string = 'https://builds.dotnet.microsoft.com/dotnet/scripts/v1/dotnet-install.';
    protected readonly scriptFilePath: string;
    private readonly fileUtilities: FileUtilities;
    private readonly scriptFileEnding = os.platform() === 'win32' ? 'ps1' : 'sh';

    protected readonly scriptFileName: string = 'dotnet-install';

    constructor(private readonly context: IAcquisitionWorkerContext)
    {
        this.scriptFilePath = path.join(__dirname, 'install scripts', `${this.scriptFileName}.${this.scriptFileEnding}`);
        this.webWorker = WebRequestWorkerSingleton.getInstance();
        this.fileUtilities = new FileUtilities();
    }

    private async getFallbackScript(): Promise<string>
    {
        const fallbackPath = this.getFallbackScriptPath();
        if ((await this.fileUtilities.exists(fallbackPath)))
        {
            this.context.eventStream.post(new DotnetFallbackInstallScriptUsed());
            return fallbackPath;
        }

        throw new EventBasedError('UnableToAcquireDotnetInstallScript', `Failed to Find Dotnet Install Script: ${this.scriptFileName}.${this.scriptFileEnding}. Please download .NET Manually.`);
    }

    public async getDotnetInstallScriptPath(): Promise<string>
    {
        try
        {
            const script = await this.webWorker.getCachedData(`${this.scriptAcquisitionUrl}${this.scriptFileEnding}`, this.context);
            if (!script)
            {
                return this.getFallbackScript();
            }

            await this.fileUtilities.writeFileOntoDisk(script, this.scriptFilePath, this.context.eventStream);
            this.context.eventStream.post(new DotnetInstallScriptAcquisitionCompleted());
            return this.scriptFilePath;
        }
        catch (error: any)
        {
            this.context.eventStream.post(new DotnetInstallScriptAcquisitionError(error as Error, getInstallFromContext(this.context)));
            return this.getFallbackScript();
        }
    }

    protected getFallbackScriptPath(): string
    {
        return this.scriptFilePath;
    }
}
