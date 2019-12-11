/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Memento } from 'vscode';
import { IEventStream } from './EventStream';
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';
import { WebRequestWorker } from './WebRequestWorker';

export class InstallScriptAcquisitionWorker implements IInstallScriptAcquisitionWorker {
    protected webWorker: WebRequestWorker;
    private readonly scriptAcquisitionUrl: string = 'https://dot.net/v1/dotnet-install'; // TODO include linux scripts here?
    private readonly scriptFileName: string;
    private readonly scriptFileEnding: string;
    private readonly scriptFilePath: string;

    constructor(extensionState: Memento, eventStream: IEventStream) {
        this.scriptFileEnding = os.platform() === 'win32' ? '.ps1' : '.sh';
        this.scriptFileName = 'dotnet-install';
        this.scriptFilePath = path.join(__dirname, '..', 'install scripts');
        this.webWorker = new WebRequestWorker(extensionState, eventStream, this.scriptAcquisitionUrl + this.scriptFileEnding, this.scriptFileName);
    }

    public async getDotnetInstallScriptPath(): Promise<string> {
        const script = await this.webWorker.getCachedData();

        fs.writeFileSync(path.join(this.scriptFilePath, this.scriptFileName + this.scriptFileEnding), script); // TODO concurrency concerns?-> need to save as a file at all?

        const runnableScriptEnding = os.platform() === 'win32' ? '.cmd' : '.sh';
        const runnableScriptPath = path.join(this.scriptFilePath, this.scriptFileName + runnableScriptEnding);
        return runnableScriptPath;
    }
}
