 /* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as eol from 'eol';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as proc from 'child_process';
import * as crypto from 'crypto';
import { IFileUtilities } from './IFileUtilities';
import * as lockfile from 'proper-lockfile';
import { IEventStream } from '../EventStream/EventStream';
import { DotnetCommandFallbackArchitectureEvent,
   DotnetCommandFallbackOSEvent,
   DotnetFileWriteRequestEvent,
   DotnetLockAcquiredEvent,
   DotnetLockAttemptingAcquireEvent,
   DotnetLockErrorEvent,
   DotnetLockReleasedEvent,
   EmptyDirectoryToWipe,
   FileToWipe,
   SuppressedAcquisitionError
} from '../EventStream/EventStreamEvents';

export class FileUtilities extends IFileUtilities
{
   public async writeFileOntoDisk(scriptContent: string, filePath: string, alreadyHoldingLock = false, eventStream? : IEventStream)
   {
       eventStream?.post(new DotnetFileWriteRequestEvent(`Request to write`, new Date().toISOString(), filePath));

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
           eventStream?.post(new DotnetFileWriteRequestEvent(`File did not exist upon write request.`, new Date().toISOString(), filePath));
           fs.writeFileSync(filePath, '');
       }

       if(!alreadyHoldingLock)
       {
           eventStream?.post(new DotnetLockAttemptingAcquireEvent(`Lock Acquisition request to begin.`, new Date().toISOString(), directoryLockPath, filePath));
           await lockfile.lock(filePath, { lockfilePath: directoryLockPath, retries: { retries: 10, minTimeout: 5, maxTimeout: 10000 } } )
           .then(async (release) =>
           {
               eventStream?.post(new DotnetLockAcquiredEvent(`Lock Acquired.`, new Date().toISOString(), directoryLockPath, filePath));

               // We would like to unlock the directory, but we can't grab a lock on the file if the directory is locked.
               // Theoretically you could: add a new file-writer lock as a 3rd party lock ...
               // Then, lock the file-writer, unlock the directory, then lock the file, then unlock file-writer, ...
               // operate, then unlock file once the operation is done.
               // For now, keep the entire directory locked.

               this.innerWriteFile(scriptContent, filePath, eventStream);

               eventStream?.post(new DotnetLockReleasedEvent(`Lock about to be released.`, new Date().toISOString(), directoryLockPath, filePath));
               return release();
           })
           .catch((e : Error) =>
           {
               // Either the lock could not be acquired or releasing it failed
               eventStream?.post(new DotnetLockErrorEvent(e, e.message, new Date().toISOString(), directoryLockPath, filePath));
           });
       }
       else
       {
           this.innerWriteFile(scriptContent, filePath, eventStream);
       }
       // End Critical Section
   }

   private innerWriteFile(scriptContent: string, filePath: string, eventStream? : IEventStream)
   {
       scriptContent = eol.auto(scriptContent);
       const existingScriptContent = fs.readFileSync(filePath).toString();
       // fs.writeFile will replace the file if it exists.
       // https://nodejs.org/api/fs.html#fswritefilefile-data-options-callback
       if(scriptContent !== existingScriptContent)
       {
           fs.writeFileSync(filePath, scriptContent);
           eventStream?.post(new DotnetFileWriteRequestEvent(`File content needed to be updated.`, new Date().toISOString(), filePath));
       }
       else
       {
           eventStream?.post(new DotnetFileWriteRequestEvent(`File content is an exact match, not writing file.`, new Date().toISOString(), filePath));
       }

       fs.chmodSync(filePath, 0o744);
   }

   /**
    * @param directoryToWipe the directory to delete all of the files in if privilege to do so exists.
    * @param fileExtensionsToDelete - if undefined, delete all files. if not, delete only files with extensions in this array in lower case.
    */
   public wipeDirectory(directoryToWipe : string, eventStream? : IEventStream, fileExtensionsToDelete? : string[])
   {
       if(!fs.existsSync(directoryToWipe))
       {
           eventStream?.post(new EmptyDirectoryToWipe(`The directory ${directoryToWipe} did not exist, so it was not wiped.`))
           return;
       }

       // Use rimraf to delete all of the items in a directory without the directory itself.
       fs.readdirSync(directoryToWipe).forEach(f =>
       {
           try
           {
               eventStream?.post(new FileToWipe(`The file ${f} is being deleted.`))
               if(!fileExtensionsToDelete || path.extname(f).toLocaleLowerCase() in fileExtensionsToDelete)
               fs.rmSync(path.join(directoryToWipe, f));
           }
           catch(error : any)
           {
               eventStream?.post(new SuppressedAcquisitionError(error, `Failed to delete ${f} when marked for deletion.`));
           }
       });
   }

   /**
    *
    * @param nodeArchitecture the architecture in node style string of what to install
    * @returns the architecture in the style that .net / the .net install scripts expect
    *
    * Node - amd64 is documented as an option for install scripts but its no longer used.
    * s390x is also no longer used.
    * ppc64le is supported but this version of node has no distinction of the endianness of the process.
    * It has no mapping to mips or other node architectures.
    *
    * @remarks Falls back to string 'auto' if a mapping does not exist which is not a valid architecture.
    */
   public nodeArchToDotnetArch(nodeArchitecture : string, eventStream : IEventStream)
   {
       switch(nodeArchitecture)
       {
           case 'x64': {
               return nodeArchitecture;
           }
           case 'ia32': {
               return 'x86';
           }
           case 'x86': {
               // In case the function is called twice
               return 'x86';
           }
           case 'arm': {
               return nodeArchitecture;
           }
           case 'arm64': {
               return nodeArchitecture;
           }
           case 's390x': {
               return 's390x';
           }
           default: {
               eventStream.post(new DotnetCommandFallbackArchitectureEvent(`The architecture ${os.arch()} of the platform is unexpected, falling back to auto-arch.`));
               return 'auto';
           }
       }
   }

    /**
     *
     * @param nodeArchitecture the architecture output of dotnet --info from the runtime
     * @returns the architecture in the style that node expects
     *
     * @remarks Falls back to string 'auto' if a mapping does not exist which is not a valid architecture.
     * So far, the outputs are actually all identical so this is not really 'needed' but good to have in the future :)
     */
    public static dotnetInfoArchToNodeArch(dotnetInfoArch : string, eventStream : IEventStream)
    {
        switch(dotnetInfoArch)
        {
            case 'x64': {
                return dotnetInfoArch;
            }
            case 'x86': {
                // In case the function is called twice
                return dotnetInfoArch;
            }
            case 'arm': { // This shouldn't be an output yet, but its possible in the future
                return dotnetInfoArch;
            }
            case 'arm64': {
                return dotnetInfoArch;
            }
            default: {
                eventStream.post(new DotnetCommandFallbackArchitectureEvent(`The architecture ${dotnetInfoArch} of the platform is unexpected, falling back to auto-arch.`));
                return 'auto';
            }
        }
    }

   /**
    *
    * @param nodeOS the OS in node style string of what to install
    * @returns the OS in the style that .net / the .net install scripts expect
    *
    */
   public nodeOSToDotnetOS(nodeOS : string, eventStream : IEventStream)
   {
       switch(nodeOS)
       {
           case 'win32': {
               return 'win';
           }
           case 'darwin': {
               return 'osx';
           }
           case 'linux': {
               return nodeOS;
           }
           default: {
               eventStream.post(new DotnetCommandFallbackOSEvent(`The OS ${os.platform()} of the platform is unexpected, falling back to auto-os.`));
               return 'auto'
           }
       }
   }

   /**
    *
    * @returns true if the process is running with admin privileges
    */
   public isElevated(eventStream? : IEventStream) : boolean
   {
       if(os.platform() !== 'win32')
       {
           try
           {
               const commandResult = proc.spawnSync('id', ['-u']);
               return commandResult.status === 0;
           }
           catch(error : any)
           {
               eventStream?.post(new SuppressedAcquisitionError(error, `Failed to run 'id' to check for privilege, running without privilege.`))
               return false;
           }
       }

       try
       {
           // If we can execute this command on Windows then we have admin rights.
           proc.execFileSync( 'net', ['session'], { 'stdio': 'ignore' } );
           return true;
       }
       catch ( error : any )
       {
           eventStream?.post(new SuppressedAcquisitionError(error, `Failed to run 'net' to check for privilege, running without privilege.`))
           return false;
       }
   }

   private sha512Hasher(filePath : string)
   {
       return new Promise<string>((resolve, reject) =>
       {
           const hash = crypto.createHash('sha512');
           const fileStream = fs.createReadStream(filePath);
           fileStream.on('error', err => reject(err));
           fileStream.on('data', chunk => hash.update(chunk));
           fileStream.on('end', () => resolve(hash.digest('hex')));
       })
   };

   public async getFileHash(filePath : string) : Promise<string | null>
   {
       const res = await this.sha512Hasher(filePath);
       return res;
   }
}

