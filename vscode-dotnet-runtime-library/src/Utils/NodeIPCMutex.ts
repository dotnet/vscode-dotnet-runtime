/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import { rm } from 'fs/promises';
import { createConnection, createServer, Server } from 'net';
import * as os from 'os';
import * as path from 'path';

/**
 * A wrapper you write around your logger so that events from the mutex ownership can be logged.
 */
export class INodeIPCMutexLogger
{
    public log(message: string): void
    {
        console.log(message); // Replace with your own logging implementation.
    }
}

/**
 * NodeIPCMutex is a class that provides a mutex (mutual exclusion) lock using IPC (Inter-Process Communication) on Node.js.
 * It will work across multiple processes and async code in the same process.
 * It uses a named pipe on Windows and a file descriptor on Linux and OS X to create the lock.
 *
 * Many locking mechanisms such as lockfile and proper-lockfile run into issues when processes are killed or die unexpectedly, because they rely on the file system.
 * windows-mutex is another library, which is a wrapper around a C mutex, however it is Windows only.
 * async-mutex is another node.js library, but it stores a list of owners in memory, which may cause issues if multiple processes try to acquire the same lock.
 * Named pipes on windows die when processes die. There is no equivalent check on Linux or OS X, but IPC allows us to check whether the process is still alive or not so we don't deadlock
 *
 * Much of this code is inspired by VSCode's IPC code, which is a well tested approach. However, their approach focuses on permitting only one main VS Code Process to run at a time.
 * https://github.com/microsoft/vscode/blob/main/extensions/git/src/ipc/ipcServer.ts#L15
 * https://github.com/microsoft/vscode/blob/main/src/vs/code/electron-main/main.ts#L318
 */
export class NodeIPCMutex
{
    private readonly lockPath: string;
    private server?: Server;

    /**
     *
     * @param lockId - The ID of the lock. This should be a unique identifier for the lock being created.
     * @param logger - A custom logger for your own logging events. By default, this will log to the console.
     */
    constructor(lockId: string, readonly logger: INodeIPCMutexLogger = new INodeIPCMutexLogger())
    {
        this.lockPath = this.getIPCHandlePath(lockId);
    }

    private getIPCHandlePath(id: string): string
    {
        // The windows file system default length may cause us to fail to create the handle if we don't truncate it.
        if (id.length > (256 - `\\\\.\\pipe\\vscode-dotnet-install-tool-`.length))
        {
            id = id.substring(0, 255);
        }

        if (process.platform === 'win32')
        {
            // Special File System to get a Named Pipe on windows (File Descriptors won't work) : https://nodejs.org/docs/latest/api/net.html#ipc-support:~:text=On%20Windows%2C%20the,owning%20process%20exits.
            return `\\\\.\\pipe\\vscode-dotnet-install-tool-${id}-sock`;
        }

        if (process.platform !== 'darwin' && process.env.XDG_RUNTIME_DIR)
        {
            // The user or system told us to use this as our applications temporary directory, so this this instead of /temp/
            return path.join(process.env.XDG_RUNTIME_DIR as string, `vscode-dotnet-install-tool-${id}.sock`);
        }

        // A file descriptor in /temp/ is a good option to hold this sock.
        // Access to /tmp/ may be restricted, but all processes must use the same directory, we can't really condition on this.
        return path.join(os.tmpdir(), `vscode-dotnet-install-tool-${id}.sock`);
    }

    /**
     * @remarks This function will try to hold a lock to prevent both other processes and other async code in this processes from running simultaneously..
     * It will retry acquiring the lock if it is already held by another process or async code in this process.
     * It will also check if the lock is stale (i.e., if the process holding the lock has died) and clean it up if necessary.
     * It will fail and throw if it cannot acquire the lock after the specified number of retries.
     *
     * @param fn - The function to run while we have the lock. This should be a promise, and will be awaited with its value returned.
     * Use the () => {} syntax to ensure your scope is correctly bound to the function so it can access the variables you declare.
     * @param retryDelayMs The number of milliseconds to wait before retrying to acquire the lock if it is already held by another process.
     * @param timeoutTimeMs The total amount of time to try to acquire the lock before giving up. This is the maximum time to wait for the lock to be released.
     * @param actionId The action ID to use for logging and debugging purposes. This should be a unique identifier for the action being performed.
     * @returns The awaited value returned by the function passed in as fn.
     */
    public async acquire<T>(fn: () => Promise<T>, retryDelayMs = 100, timeoutTimeMs = 1000, actionId: string): Promise<T>
    {
        const maxRetries = timeoutTimeMs / retryDelayMs;
        let retries = 0;

        while (true)
        {
            try
            {
                return await this.tryAcquire(fn);
            }
            catch (error: any)
            {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                if (error?.code === 'EADDRINUSE') //  We couldn't acquire the lock, even though nobody else is using it.
                {
                    if (retries >= maxRetries)
                    {
                        throw new Error(`Failed to acquire lock after ${maxRetries} retries.`);
                    }

                    if (await this.isLockStale(actionId))
                    {
                        await this.cleanupStaleLock();
                    }
                    else
                    {
                        await this.delay(retryDelayMs);
                        retries++;
                    }
                }
                else // Another process is using this lock.
                {
                    throw error;
                }
            }
        }
    }

    private async tryAcquire<T>(fn: () => Promise<T>): Promise<T>
    {
        return new Promise<T>((resolve, reject) =>
        {
            this.server = createServer();

            this.server.on('error', reject);
            // The listeningListener interface is designed to return void, but we need to return the result of running f while holding the handle.
            // eslint-disable-next-line  @typescript-eslint/no-misused-promises
            this.server.listen(this.lockPath, async () =>
            {
                this.server?.removeListener('error', reject);
                try
                {
                    // Set permissions to allow other processes to access/delete the handle
                    // On Windows, only write permissions can be changed, but that is OK.
                    // https://nodejs.org/api/fs.html#filehandlechmodmode:~:text=Caveats%3A%20on%20Windows%20only%20the%20write%20permission%20can%20be%20changed%2C%20and%20the%20distinction%20among%20the%20permissions%20of%20group%2C%20owner%2C%20or%20others%20is%20not%20implemented.
                    await fs.promises.chmod(this.lockPath, 0o666); // 6 is read/write (not execute) for user, group, and others.
                }
                catch (err: any)
                {
                    this.logger.log(`Failed to set permissions on ${this.lockPath}: ${JSON.stringify(err ?? '')}`);
                }

                try
                {
                    const returnResult = await fn();
                    return resolve(returnResult); // Return out, and let the finally logic close the server before we return.
                }
                catch (err: any)
                {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    return reject(err?.message && err?.name ? err as Error : new Error(`Failed to acquire lock: ${JSON.stringify(err ?? '')}`));
                }
                finally
                {
                    this.release(); // Release the lock when done.
                }
            });
        })
    }

    private release(): void
    {
        if (this.server)
        {
            try
            {
                this.server?.close();
                // .close() will delete the fd on Linux and OS X, if the process doesn't die, so we don't need to do that again.
            }
            catch (err: any)
            {
                this.logger.log(`Failed to close server: ${err}`);
            }
            finally
            {
                this.server = undefined;
            }
        }
    }

    /**
     * @remarks A stale lock is a lock that is held by a process that has died or is no longer running.
     * This function checks if the lock is stale by trying to connect to it.
     *
     * @param msg - The message to log if the lock is stale.
     * @returns True if the lock is stale, false otherwise.
     */
    private async isLockStale(msg: string): Promise<boolean>
    {
        try
        {
            return await this.connectToExistingLock(msg); // Try to connect to the existing lock.
        }
        catch (error: any) // Handle synchronous errors from the socket connection.
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (error?.code === 'ECONNREFUSED') // The process is dead - it may have been pkilled and did not drop the file handle.
            {
                this.logger.log(`Lock is stale, as ECONNREFUSED detected: ${msg}.`);
                return true; // We can acquire the lock, and delete the file handle.
            }

            // Expected errors:
            // - ENOENT: The file descriptor doesn't exist, which means the process holding it has died.
            // -> Technically, this means it's stale, but the only action to do if it's stale is delete it, but it already is deleted.

            // - EPERM / EACCESS: The file descriptor exists, but we don't have permission to access it. This is expected if the process holding it is still alive and running it under elevated permissions (chmod failed)
            // - EPIPE: This might be possible, but I haven't seen it happen yet.
            this.logger.log(`Unable to acquire lock: ${JSON.stringify(error ?? '')}.`);
            return false; // We don't know what happened, but we can't acquire the lock.
        }
    }

    private connectToExistingLock(msg: string): Promise<boolean>
    {
        return new Promise<boolean>((resolve, reject) =>
        {
            const socket = createConnection(this.lockPath, () =>
            {
                socket.removeListener('error', reject); // Ignore other errors : we were able to connect, that's all that matters.
                this.logger.log(`Connected to existing lock: ${msg}`);
                socket.destroy();
                return resolve(false); // Someone else (another PID or other async code in our process) holds the 'lock' or 'server' on the handle and is live. We must wait.
            });

            socket.once('error', (err) =>
            {
                this.logger.log(`Unable to connect to existing lock: ${JSON.stringify(err ?? '')}.`);
                return reject(err); // Possible error: ENOENT, if the other process finishes and 'rm's while we wait.
            });
        })
    }

    private async cleanupStaleLock(): Promise<void>
    {
        try
        {
            // On Linux and OS X the pipe is left behind when a process holding a pipe dies.
            await rm(this.lockPath, { force: true }); // Remove the lockFile
        }
        catch (error: any)
        {
            this.logger.log(`Failed to remove stale lock: ${JSON.stringify(error ?? '')}.`);
            if (os.platform() !== 'win32')
            {
                throw error; // We don't have permission to remove the lock, and it is owned by a dead process. We can't acquire it, so there's not much else we can do.
            }
        }
    }

    private async delay(delayMs: number): Promise<void>
    {
        // Could implement exponential backoff here if we wanted to.
        return new Promise(resolve => setTimeout(resolve, delayMs));
    }
}

