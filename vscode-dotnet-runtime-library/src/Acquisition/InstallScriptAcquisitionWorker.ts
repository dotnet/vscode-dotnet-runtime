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
import { Debugging } from '../Utils/Debugging';
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



    constructor(private readonly context: IAcquisitionWorkerContext)
    {
        const scriptFileName = 'dotnet-install';
        this.scriptFilePath = path.join(__dirname, 'install scripts', `${scriptFileName}.${this.scriptFileEnding}`);
        this.webWorker = WebRequestWorkerSingleton.getInstance();
        this.fileUtilities = new FileUtilities();
    }

    public async getDotnetInstallScriptPath(): Promise<string>
    {
        try
        {
            Debugging.log('getDotnetInstallScriptPath() invoked.');
            const script = await this.webWorker.getCachedData(`${this.scriptAcquisitionUrl}${this.scriptFileEnding}`, this.context);
            if (!script)
            {
                Debugging.log('The request to acquire the script failed.');
                throw new EventBasedError('NoInstallScriptPathExists', 'Unable to get script path.');
            }

            await this.fileUtilities.writeFileOntoDisk(script, this.scriptFilePath, this.context.eventStream);
            this.context.eventStream.post(new DotnetInstallScriptAcquisitionCompleted());
            return this.scriptFilePath;
        }
        catch (error: any)
        {
            Debugging.log('An error occurred processing the install script.');
            this.context.eventStream.post(new DotnetInstallScriptAcquisitionError(error as Error, getInstallFromContext(this.context)));

            // Try to use fallback install script
            const fallbackPath = this.getFallbackScriptPath();
            if ((await this.fileUtilities.exists(fallbackPath)))
            {
                Debugging.log('Returning the fallback script path.');
                this.context.eventStream.post(new DotnetFallbackInstallScriptUsed());
                return fallbackPath;
            }

            throw new EventBasedError('UnableToAcquireDotnetInstallScript', `Failed to Acquire Dotnet Install Script: ${error}`);
        }
    }

    protected getFallbackScriptPath(): string
    {
        return this.scriptFilePath;
    }
}
