 /* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
 import * as eol from 'eol';
 import * as fs from 'fs';
 import * as path from 'path';
 import * as os from 'os';
 import * as proc from 'child_process';
 import * as lockfile from 'proper-lockfile';
import { IEventStream } from '../EventStream/EventStream';
import { DotnetFileWriteRequestEvent, DotnetLockAcquiredEvent, DotnetLockAttemptingAcquireEvent, DotnetLockErrorEvent, DotnetLockReleasedEvent } from '../EventStream/EventStreamEvents';

export class FileUtilities {

    public async writeFileOntoDisk(scriptContent: string, filePath: string, eventStream : IEventStream)
    {
        eventStream.post(new DotnetFileWriteRequestEvent(`Request to write`, new Date().toISOString(), filePath));

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
            eventStream.post(new DotnetFileWriteRequestEvent(`File did not exist upon write request.`, new Date().toISOString(), filePath));
            fs.writeFileSync(filePath, '');
        }

        eventStream.post(new DotnetLockAttemptingAcquireEvent(`Lock Acquisition request to begin.`, new Date().toISOString(), directoryLockPath, filePath));
        await lockfile.lock(filePath, { lockfilePath: directoryLockPath, retries: { retries: 10, maxTimeout: 1000 } } )
        .then(async (release) =>
        {
            eventStream.post(new DotnetLockAcquiredEvent(`Lock Acquired.`, new Date().toISOString(), directoryLockPath, filePath));

            // We would like to unlock the directory, but we can't grab a lock on the file if the directory is locked.
            // Theoretically you could: add a new file-writer lock as a 3rd party lock ...
            // Then, lock the file-writer, unlock the directory, then lock the file, then unlock file-writer, ...
            // operate, then unlock file once the operation is done.
            // For now, keep the entire directory locked.

            scriptContent = eol.auto(scriptContent);
            const existingScriptContent = fs.readFileSync(filePath).toString();
            // fs.writeFile will replace the file if it exists.
            // https://nodejs.org/api/fs.html#fswritefilefile-data-options-callback
            if(scriptContent !== existingScriptContent)
            {
                fs.writeFileSync(filePath, scriptContent);
                eventStream.post(new DotnetFileWriteRequestEvent(`File content needed to be updated.`, new Date().toISOString(), filePath));
            }
            else
            {
                eventStream.post(new DotnetFileWriteRequestEvent(`File content is an exact match, not writing file.`, new Date().toISOString(), filePath));
            }

            fs.chmodSync(filePath, 0o744);
            eventStream.post(new DotnetLockReleasedEvent(`Lock about to be released.`, new Date().toISOString(), directoryLockPath, filePath));
            return release();
        })
        .catch((e : Error) =>
        {
            // Either the lock could not be acquired or releasing it failed
            eventStream.post(new DotnetLockErrorEvent(e, e.message, new Date().toISOString(), directoryLockPath, filePath));
        });
        // End Critical Section
    }

    /**
     * @param directoryToWipe the directory to delete all of the files in if privellege to do so exists.
     */
    public wipeDirectory(directoryToWipe : string)
    {
        if(!fs.existsSync(directoryToWipe))
        {
            return;
        }

        // Use rimraf to delete all of the items in a directory without the directory itself.
        fs.readdirSync(directoryToWipe).forEach(f => fs.rmSync(`${directoryToWipe}/${f}`));
    }

    /**
     *
     * @returns true if the process is running with admin privelleges on windows.
     */
    public isElevated() : boolean
    {
        if(os.platform() !== 'win32')
        {
            const commandResult = proc.spawnSync('id', ['-u']);
            return commandResult.status === 0;
        }

        try
        {
            // If we can execute this command on Windows then we have admin rights.
            proc.execFileSync( 'net', ['session'], { 'stdio': 'ignore' } );
            return true;
        }
        catch ( error )
        {
            return false;
        }
    }
}

