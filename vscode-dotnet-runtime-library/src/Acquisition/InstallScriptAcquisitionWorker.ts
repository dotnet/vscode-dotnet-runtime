/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as eol from 'eol';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IEventStream } from '../EventStream/EventStream';
import {
    DotnetFallbackInstallScriptUsed,
    DotnetInstallScriptAcquisitionCompleted,
    DotnetInstallScriptAcquisitionError,
} from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';
import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { Debugging } from '../Utils/Debugging';
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';

export class InstallScriptAcquisitionWorker implements IInstallScriptAcquisitionWorker {
    protected webWorker: WebRequestWorker;
    private readonly scriptAcquisitionUrl: string = 'https://dot.net/v1/dotnet-install.';
    private readonly scriptFilePath: string;

    constructor(extensionState: IExtensionState, private readonly eventStream: IEventStream) {
        const scriptFileEnding = os.platform() === 'win32' ? 'ps1' : 'sh';
        const scriptFileName = 'dotnet-install';
        this.scriptFilePath = path.join(__dirname, 'install scripts', `${scriptFileName}.${scriptFileEnding}`);
        this.webWorker = new WebRequestWorker(extensionState, eventStream, this.scriptAcquisitionUrl + scriptFileEnding);
    }

    public async getDotnetInstallScriptPath(): Promise<string> {
        try
        {
            Debugging.log('getDotnetInstallScriptPath() invoked.');
            const script = await this.webWorker.getCachedData();
            if (!script) {
                Debugging.log('The request to acquire the script failed.');
                throw new Error('Unable to get script path.');
            }

            Debugging.log('Writing the dotnet install script into a file.');
            this.writeScriptAsFile(script, this.scriptFilePath);

            Debugging.log('The dotnet install script has been successfully written to disk. Returning the path.');
            this.eventStream.post(new DotnetInstallScriptAcquisitionCompleted());
            return this.scriptFilePath;
        }
        catch (error)
        {
            Debugging.log('An error occured processing the install script.');
            this.eventStream.post(new DotnetInstallScriptAcquisitionError(error as Error));

            // Try to use fallback install script
            const fallbackPath = this.getFallbackScriptPath();
            if (fs.existsSync(fallbackPath)) {
                Debugging.log('Returning the fallback script path.');
                this.eventStream.post(new DotnetFallbackInstallScriptUsed());
                return fallbackPath;
            }

            throw new Error(`Failed to Acquire Dotnet Install Script: ${error}`);
        }
    }

    // Protected for testing purposes
    protected writeScriptAsFile(scriptContent: string, filePath: string) {
        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        scriptContent = eol.auto(scriptContent);
        fs.writeFileSync(filePath, scriptContent);
        fs.chmodSync(filePath, 0o700);
    }

    // Protected for testing purposes
    protected getFallbackScriptPath(): string {
        return this.scriptFilePath;
    }
}
