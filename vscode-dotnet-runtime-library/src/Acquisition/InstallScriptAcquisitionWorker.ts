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
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';
import { FileUtilities } from '../Utils/FileUtilities';

export class InstallScriptAcquisitionWorker implements IInstallScriptAcquisitionWorker {
    protected webWorker: WebRequestWorker;
    private readonly scriptAcquisitionUrl: string = 'https://dot.net/v1/dotnet-install.';
    private readonly scriptFilePath: string;
    private readonly scriptFileEnding: string;


    constructor(extensionState: IExtensionState, private readonly eventStream: IEventStream) {
        this.scriptFileEnding = os.platform() === 'win32' ? 'ps1' : 'sh';
        const scriptFileName = 'dotnet-install';
        this.scriptFilePath = path.join(__dirname, 'install scripts', `${scriptFileName}.${this.scriptFileEnding}`);
        this.webWorker = new WebRequestWorker(extensionState, eventStream);
    }

    public async getDotnetInstallScriptPath(): Promise<string> {
        try {
            const script = await this.webWorker.getCachedData(this.scriptAcquisitionUrl + this.scriptFileEnding);
            if (!script) {
                throw new Error('Unable to get script path.');
            }

            FileUtilities.writeFileOntoDisk(script, this.scriptFilePath);
            this.eventStream.post(new DotnetInstallScriptAcquisitionCompleted());
            return this.scriptFilePath;
        } catch (error) {
            this.eventStream.post(new DotnetInstallScriptAcquisitionError(error as Error));

            // Try to use fallback install script
            const fallbackPath = this.getFallbackScriptPath();
            if (fs.existsSync(fallbackPath)) {
                this.eventStream.post(new DotnetFallbackInstallScriptUsed());
                return fallbackPath;
            }

            throw new Error(`Failed to Acquire Dotnet Install Script: ${error}`);
        }
    }

    // Protected for testing purposes
    protected getFallbackScriptPath(): string {
        return this.scriptFilePath;
    }
}
