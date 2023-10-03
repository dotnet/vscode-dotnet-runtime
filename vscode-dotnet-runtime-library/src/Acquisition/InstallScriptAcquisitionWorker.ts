/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as eol from 'eol';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { IEventStream } from '../EventStream/EventStream';
import {
    DotnetFallbackInstallScriptUsed,
    DotnetFileWriteRequestEvent,
    DotnetInstallScriptAcquisitionCompleted,
    DotnetInstallScriptAcquisitionError,
    DotnetLockAcquiredEvent,
    DotnetLockAttemptingAcquireEvent,
    DotnetLockErrorEvent,
    DotnetLockReleasedEvent,
} from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';
import { WebRequestWorker } from '../Utils/WebRequestWorker';
import { Debugging } from '../Utils/Debugging';
import { IInstallScriptAcquisitionWorker } from './IInstallScriptAcquisitionWorker';
import { FileUtilities } from '../Utils/FileUtilities';

export class InstallScriptAcquisitionWorker implements IInstallScriptAcquisitionWorker {
    protected webWorker: WebRequestWorker;
    private readonly scriptAcquisitionUrl: string = 'https://dot.net/v1/dotnet-install.';
    private readonly scriptFilePath: string;
    private readonly fileUtilities: FileUtilities;


    constructor(extensionState: IExtensionState, private readonly eventStream: IEventStream, private readonly timeoutTime : number) {
        const scriptFileEnding = os.platform() === 'win32' ? 'ps1' : 'sh';
        const scriptFileName = 'dotnet-install';
        this.scriptFilePath = path.join(__dirname, 'install scripts', `${scriptFileName}.${scriptFileEnding}`);
        this.webWorker = new WebRequestWorker(extensionState, eventStream, this.scriptAcquisitionUrl + scriptFileEnding, this.timeoutTime * 1000);
        this.fileUtilities = new FileUtilities();
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

            await this.fileUtilities.writeFileOntoDisk(script, this.scriptFilePath, this.eventStream);
            this.eventStream.post(new DotnetInstallScriptAcquisitionCompleted());
            return this.scriptFilePath;
        }
        catch (error)
        {
            Debugging.log('An error occurred processing the install script.');
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

    protected getFallbackScriptPath(): string {
        return this.scriptFilePath;
    }
}
