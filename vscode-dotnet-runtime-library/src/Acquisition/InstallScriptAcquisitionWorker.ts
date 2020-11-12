/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as eol from 'eol';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Memento } from 'vscode';
import { IEventStream } from '../EventStream/EventStream';
import {
    DotnetFallbackInstallScriptUsed,
    DotnetInstallScriptAcquisitionCompleted,
    DotnetInstallScriptAcquisitionError,
} from '../EventStream/EventStreamEvents';
import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';

export class InstallScriptAcquisitionWorker implements IInstallScriptAcquisitionWorker {
    protected webWorker: WebRequestWorker;
    private readonly scriptAcquisitionUrl: string = 'https://aka.ms/dotnet-install-script-';
    private readonly scriptFilePath: string;

    constructor(extensionState: Memento, private readonly eventStream: IEventStream) {
        const scriptFileEnding = os.platform() === 'win32' ? 'ps1' : 'sh';
        const scriptFileName = 'dotnet-install';
        this.scriptFilePath = path.join(__dirname, 'install scripts', `${scriptFileName}.${scriptFileEnding}`);
        this.webWorker = new WebRequestWorker(extensionState, eventStream, this.scriptAcquisitionUrl + scriptFileEnding, scriptFileName);
    }

    public async getDotnetInstallScriptPath(): Promise<string> {
        try {
            const script = await this.webWorker.getCachedData();
            if (!script) {
                throw new Error('Unable to get script path.');
            }

            this.writeScriptAsFile(script, this.scriptFilePath);
            this.eventStream.post(new DotnetInstallScriptAcquisitionCompleted());
            return this.scriptFilePath;
        } catch (error) {
            this.eventStream.post(new DotnetInstallScriptAcquisitionError(error));

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
    protected writeScriptAsFile(scriptContent: string, filePath: string) {
        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        scriptContent = eol.auto(scriptContent);
        fs.writeFileSync(filePath, scriptContent);
        fs.chmodSync(filePath, 0o777);
    }

    // Protected for testing purposes
    protected getFallbackScriptPath(): string {
        return this.scriptFilePath;
    }
}
