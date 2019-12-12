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
    private readonly scriptAcquisitionUrl: string = 'https://dot.net/v1/dotnet-install';
    private readonly scriptFilePath: string;

    constructor(extensionState: Memento, eventStream: IEventStream) {
        const scriptFileEnding = os.platform() === 'win32' ? '.ps1' : '.sh';
        const scriptFileName = 'dotnet-install';
        this.scriptFilePath = path.join(__dirname, 'install scripts', scriptFileName + scriptFileEnding);
        this.webWorker = new WebRequestWorker(extensionState, eventStream, this.scriptAcquisitionUrl + scriptFileEnding, scriptFileName);
    }

    public async getDotnetInstallScriptPath(): Promise<string> {
        const script = await this.webWorker.getCachedData();
        if (!fs.existsSync(path.dirname(this.scriptFilePath))) {
            fs.mkdirSync(path.dirname(this.scriptFilePath), { recursive: true });
        }
        fs.writeFileSync(this.scriptFilePath, script);
        fs.chmodSync(this.scriptFilePath, 0o777);
        return this.scriptFilePath;
    }
}
