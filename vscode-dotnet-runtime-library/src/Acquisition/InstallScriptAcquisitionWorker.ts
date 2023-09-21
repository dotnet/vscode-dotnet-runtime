/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
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

export class InstallScriptAcquisitionWorker implements IInstallScriptAcquisitionWorker {
    protected webWorker: WebRequestWorker;
    private readonly scriptAcquisitionUrl: string = 'https://dot.net/v1/dotnet-install.';
    protected readonly scriptFilePath: string;

    constructor(extensionState: IExtensionState, private readonly eventStream: IEventStream, private readonly timeoutTime : number) {
        const scriptFileEnding = os.platform() === 'win32' ? 'ps1' : 'sh';
        const scriptFileName = 'dotnet-install';
        this.scriptFilePath = path.join(__dirname, 'install scripts', `${scriptFileName}.${scriptFileEnding}`);
        this.webWorker = new WebRequestWorker(extensionState, eventStream, this.scriptAcquisitionUrl + scriptFileEnding, this.timeoutTime * 1000);
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
            await this.writeScriptAsFile(script, this.scriptFilePath);

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
    protected async writeScriptAsFile(scriptContent: string, filePath: string)
    {
        this.eventStream.post(new DotnetFileWriteRequestEvent(`Request to write`, new Date().toISOString(), filePath));

        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        // Prepare to lock directory so we can check file exists atomically
        const directoryLock = 'dir.lock';
        const directoryLockPath = path.join(path.dirname(filePath), directoryLock);

        // Begin Critical Section
        // This check is part of a RACE CONDITION, it is technically part of the critical section as you will fail if the file DNE,
        //  but you cant lock the file until it exists. Since there is no context in which files written by this are deleted while this can run,
        //  theoretically, this ok. The library SHOULD provide a RAII based system for locks, but it does not.
        if(!fs.existsSync(filePath))
        {
            // Create an empty file, as proper-lockfile fails to lock a file if file dne
            this.eventStream.post(new DotnetFileWriteRequestEvent(`File did not exist upon write request.`, new Date().toISOString(), filePath));
            fs.writeFileSync(filePath, '');
        }

        this.eventStream.post(new DotnetLockAttemptingAcquireEvent(`Lock Acqusition request to begin.`, new Date().toISOString(), directoryLockPath, filePath));
        await lockfile.lock(filePath, { lockfilePath: directoryLockPath, retries: { retries: 10, maxTimeout: 1000 } } )
        .then(async (release) =>
        {
            this.eventStream.post(new DotnetLockAcquiredEvent(`Lock Acquired.`, new Date().toISOString(), directoryLockPath, filePath));

            // We would like to unlock the directory, but we can't grab a lock on the file if the directory is locked.
            // Theoretically you could: add a new filewriter lock as a 3rd party lock ...
            // Then, lock the filewriter, unlock the directory, then lock the file, then unlock filewriter, ...
            // operate, then unlock file once the operation is done.
            // For now, keep the entire directory locked.

            scriptContent = eol.auto(scriptContent);
            const existingScriptContent = fs.readFileSync(filePath).toString();
            // fs.writeFile will replace the file if it exists.
            // https://nodejs.org/api/fs.html#fswritefilefile-data-options-callback
            if(scriptContent !== existingScriptContent)
            {
                fs.writeFileSync(filePath, scriptContent);
                fs.chmodSync(filePath, 0o744);
                this.eventStream.post(new DotnetFileWriteRequestEvent(`File content needed to be updated.`, new Date().toISOString(), filePath));
            }
            else
            {
                this.eventStream.post(new DotnetFileWriteRequestEvent(`File content is an exact match, not writing file.`, new Date().toISOString(), filePath));
            }

            this.eventStream.post(new DotnetLockReleasedEvent(`Lock about to be released.`, new Date().toISOString(), directoryLockPath, filePath));
            return release();
        })
        .catch((e : Error) =>
        {
            // Either the lock could not be acquired or releasing it failed
            this.eventStream.post(new DotnetLockErrorEvent(e, e.message, new Date().toISOString(), directoryLockPath, filePath));
        });
        // End Critical Section
    }

    // Protected for testing purposes
    protected getFallbackScriptPath(): string {
        return this.scriptFilePath;
    }
}
