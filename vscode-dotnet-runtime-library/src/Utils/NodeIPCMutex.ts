/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { rm, stat } from 'fs/promises';
import { createConnection, createServer, Server } from 'net';
import * as os from 'os';
import * as path from 'path';

/**
 * Customize logging events for the mutex using this interface.
 */
export class INodeIPCMutexLogger
{
    public log(message: string): void
    {
        // no op
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
    protected readonly lockPath: string;
    private readonly supplementalErrorInfo: string;
    private server?: Server;
    private hasCleanedUpBefore = false;
    /**
     *
     * @param lockId - The ID of the lock. This should be a unique identifier for the lock being created.
     * The lockId must be less than about 90 characters as it will get truncated down to 107 characters -- if it is longer than the temp folder may allow on OS X, it may fail.
     * // https://nodejs.org/api/net.html#:~:text=other%20operating%20systems.-,Identifying%20paths%20for%20IPC%20connections,-%23
     * @param logger - A custom logger for your own logging events. By default, this will log to the console.
     */
    constructor(lockId: string, readonly logger: INodeIPCMutexLogger = new INodeIPCMutexLogger(), lockFailureErrorMessage?: string)
    {
        this.supplementalErrorInfo = lockFailureErrorMessage ?? '';
        this.lockPath = this.getIPCHandlePath(lockId);
    }

    /**
     * @remarks Resolves the directory to hold the IPC handle in. Extracted as a protected method so tests
     * can override it to use a directory they fully control (e.g. for simulating permission errors).
     *
     * On Unix, A file descriptor in /tmp/ is a good option to hold this sock.
     * In Linux, The user or system may set XDG_RUNTIME_DIR to set our applications temporary directory, so use this instead of /tmp/
     * On Unix, Access to /tmp/ may be restricted, but all processes must use the same directory, so we can't condition to use another dir based on the permissions for it.
     *
     * CAVEAT: XDG_RUNTIME_DIR (typically /run/user/<uid>/) is set by pam_systemd during login sessions.
     * It is NOT set when SSH is configured without PAM (UsePAM no), when using su/sudo -u, inside containers
     * without systemd, in cron jobs, or in CI/CD environments. If one VS Code process has XDG_RUNTIME_DIR
     * set and another doesn't, they will create sockets in different directories (/run/user/<uid>/ vs /tmp/),
     * silently breaking cross-process mutex isolation. VS Code's own IPC code has the same limitation:
     * https://github.com/microsoft/vscode/blob/main/src/vs/base/parts/ipc/node/ipc.net.ts
     *
     * On Windows, '\\\\.\\pipe\\` is a Special File System to get a Named Pipe (File Descriptors won't work)
     * https://nodejs.org/docs/latest/api/net.html#ipc-support:~:text=On%20Windows%2C%20the,owning%20process%20exits.
     */
    protected getIPCDirectory(): string
    {
        return os.platform() === 'win32' ? `\\\\.\\pipe\\` :
            os.platform() === 'linux' && process.env.XDG_RUNTIME_DIR ? process.env.XDG_RUNTIME_DIR as string : os.tmpdir();
    }

    private getIPCHandlePath(id: string): string
    {
        const lengthLimit = os.platform() === 'win32' ? 256 : 104; // Mac 10.9 and FreeBSD have their own length limit.
        const ipcPathDir = this.getIPCDirectory();

        if (id.length > (lengthLimit - ipcPathDir.length))
        {
            this.logger.log(`Lock ID is too long, truncating to ${lengthLimit - ipcPathDir.length} characters, due to dir: ${ipcPathDir}`);
            id = id.substring(0, Math.max(lengthLimit - 1, 6)); // Prevent setting the environment variable to make the application fail. the vscd prefix + 2 should uniquely identify most locks.
        }

        if (process.platform === 'win32')
        {
            return `${ipcPathDir}vscd-${id}-sock`;
        }
        else
        {
            return path.join(ipcPathDir, `vscd-${id}.sock`);
        }
    }

    /**
     * @remarks This function will try to hold a lock to prevent both other processes and other async code in this processes from running simultaneously.
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
        return this.acquireInternal(fn, retryDelayMs, timeoutTimeMs, actionId);
    }

    private async acquireInternal<T>(fn: () => Promise<T>, retryDelayMs: number, timeoutTimeMs: number, actionId: string, manualRelease = false): Promise<T>
    {
        const maxRetryCountToEndAtRoughlyTimeoutTime = Math.ceil(timeoutTimeMs / retryDelayMs) + 1;
        let retries = 0;

        while (true)
        {
            try
            {
                return await this.tryAcquire(actionId, fn, manualRelease);
            }
            catch (error: any)
            {
                // These are the retryable error codes from server.listen():
                // - EADDRINUSE: Another process or async task in this process is currently listening on the socket path. The lock is held.
                // - EEXIST: The socket file already exists on disk (stale leftover from a dead process on some OS/filesystem combos).
                // - EACCES: Permission denied creating/binding the socket — e.g. /run/user/<uid>/ permissions changed,
                //   stale XDG_RUNTIME_DIR after a uid mismatch / session teardown, or parent directory not writable
                // - EPERM: Operation not permitted — similar to EACCES but from kernel-level policy (SELinux, AppArmor, or elevated-permission mismatch).
                //   VS Code's main process also handles EPERM alongside EACCES: https://github.com/microsoft/vscode/blob/main/src/vs/code/electron-main/main.ts
                // - EROFS: Read-only file system — e.g. macOS Signed System Volume where "/" is mounted read-only.
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                const errorCode = error?.code;
                if (errorCode === 'EADDRINUSE' || errorCode === 'EEXIST' || errorCode === 'EACCES' || errorCode === 'EPERM' || errorCode === 'EROFS')
                {
                    // Log the errno on every retry. This is essential for diagnosing field issues
                    // where the raw libuv trace gives no actionable signal. Keep the payload small
                    // to avoid flooding logs.
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    this.logger.log(`Action: ${actionId} Lock acquire retryable error: ${errorCode} (${String(error?.message ?? '')}) retry ${retries + 1}/${maxRetryCountToEndAtRoughlyTimeoutTime}`);

                    if (retries >= maxRetryCountToEndAtRoughlyTimeoutTime)
                    {
                        const diagnostic = await this.crossUidDiagnostic(actionId);
                        throw new Error(`Action: ${actionId} Failed to acquire lock ${this.lockPath} after ${retries} retries out of ${maxRetryCountToEndAtRoughlyTimeoutTime} total available attempts. Last error: ${errorCode}.${diagnostic}\n${this.supplementalErrorInfo}`);
                    }

                    if (await this.isLockStale(actionId))
                    {
                        this.logger.log(`Action: ${actionId} - Stale lock detected, cleaning up.`);
                        await this.cleanupStaleLock();
                        if (this.hasCleanedUpBefore)
                        {
                            this.logger.log(`Action: ${actionId} - Stale lock detected, and we've detected that before. Trying to release the server.`);
                            await this.delay(retryDelayMs);
                        }
                        this.hasCleanedUpBefore = true;
                    }
                    else
                    {
                        await this.delay(retryDelayMs);
                    }

                    ++retries;
                }
                else // Another process is using this lock.
                {
                    throw error;
                }
            }
        }
    }

    public async acquireWithManualRelease(actionId: string, retryDelayMs = 100, timeoutTimeMs = 1000): Promise<() => void>
    {
        // eslint-disable-next-line @typescript-eslint/require-await
        await this.acquireInternal(async () => { return; }, retryDelayMs, timeoutTimeMs, actionId, true);
        return () =>
        {
            this.release(actionId);
        };
    }

    private async tryAcquire<T>(actionId: string, fn: () => Promise<T>, manualRelease = false): Promise<T>
    {
        return new Promise<T>((resolve, reject) =>
        {
            this.server = createServer();

            this.server.on('error', reject);
            // The listeningListener interface is designed to return void, but we need to return the result of running fn while holding the handle.
            // eslint-disable-next-line  @typescript-eslint/no-misused-promises
            this.server.listen(this.lockPath, async () =>
            {
                try
                {
                    this.server?.removeListener('error', reject);
                    this.logger.log(`Action: ${actionId} Lock acquired: ${this.lockPath}`);
                    const returnResult = await fn();
                    return resolve(returnResult); // Return out, and let the finally logic close the server before we return.
                }
                catch (err: any)
                {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    return reject(err?.message && err?.name ? err as Error : new Error(`Action: ${actionId} Failed During Execution: ${JSON.stringify(err ?? '')}`));
                }
                finally
                {
                    if (!manualRelease)
                    {
                        this.release(actionId); // Release the lock when done.
                    }
                }
            });
        })
    }

    private release(actionId: string): void
    {
        if (this.server)
        {
            try
            {
                this.server?.close();
                this.logger.log(`Action: ${actionId} Lock freed: ${this.lockPath}`);
                // .close() will delete the fd on Linux and OS X, if the process doesn't die, so we don't need to do that again.
            }
            catch (err: any)
            {
                this.logger.log(`Action: ${actionId} Failed to close server: ${err}`);
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
     * @param actionId - The message to log if the lock is stale.
     * @returns True if the lock is stale, false otherwise.
     */
    private async isLockStale(actionId: string): Promise<boolean>
    {
        try
        {
            return await this.connectToExistingLock(actionId); // Try to connect to the existing lock.
        }
        catch (error: any) // Handle synchronous errors from the socket connection.
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (error?.code === 'ECONNREFUSED' || error?.code === 'ECONNRESET') // The process is dead - it may have been pkilled and did not drop the file handle, or died mid-handshake.
            {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                this.logger.log(`Action: ${actionId} found Lock is stale, as ${error?.code} detected.`);
                return true; // We can acquire the lock, and delete the file handle.
            }

            // Expected errors (non-stale):
            // - ENOENT: The socket file doesn't exist. Technically stale, but the only action
            //   would be to delete it, and it already is deleted.
            // - EACCES / EPERM: We can't access the socket. Possible causes include a restrictive
            //   parent directory, socket file owned by another user, or an OS policy denial. Not
            //   evidence of staleness, so we cannot safely delete the file.

            this.logger.log(`Action: ${actionId} Unable to acquire lock: ${JSON.stringify(error ?? '')}.`);
            return false; // We don't know what happened, but we can't acquire the lock.
        }
    }

    private connectToExistingLock(actionId: string): Promise<boolean>
    {
        return new Promise<boolean>((resolve, reject) =>
        {
            const socket = createConnection(this.lockPath, () =>
            {
                try
                {
                    socket.removeListener('error', reject); // Ignore other errors : we were able to connect, that's all that matters.
                    this.logger.log(`Action: ${actionId} Connected to existing lock.`);
                    return resolve(false); // Someone else (another PID or other async code in our process) holds the 'lock' or 'server' on the handle and is live. We must wait.
                }
                finally
                {
                    socket.destroy(); // Clean up the socket.
                }
            });

            socket.once('error', (err) =>
            {
                try
                {
                    this.logger.log(`Action: ${actionId} Unable to connect to existing lock: ${JSON.stringify(err ?? '')}.`);
                    return reject(err); // Possible error: ENOENT, if the other process finishes and 'rm's while we wait.
                }
                finally
                {
                    socket.destroy(); // Clean up the socket.
                }
            });
        })
    }

    private async cleanupStaleLock(): Promise<void>
    {
        try
        {
            // On Linux and OS X the pipe is left behind when a process holding a pipe dies.
            this.logger.log(`Cleaning up stale lock: ${this.lockPath}`);
            await rm(this.lockPath, { force: true }); // Remove the lockFile
        }
        catch (error: any)
        {
            this.logger.log(`Failed to remove stale lock: ${JSON.stringify(error ?? '')}.`);
        }
    }

    private async delay(delayMs: number): Promise<void>
    {
        // Could implement exponential back-off here if we wanted to.
        return new Promise(resolve => setTimeout(resolve, delayMs));
    }

    /**
     * When we give up acquiring the lock, add a diagnostic hint if the socket on disk is owned
     * by a different uid than the current process. This is a common silent cause of permanent
     * lock contention: a process that ran under `sudo` created a root-owned socket, crashed
     * without unlinking it, and now non-elevated processes cannot connect (EACCES) nor unlink
     * (EPERM on sticky-bit /tmp). `fs.stat` works cross-uid because it only requires read/search
     * on the parent directory, not on the socket file itself. Unix only; Windows named pipes
     * do not have POSIX uid ownership.
     *
     * This is a best-effort diagnostic: any failure here (missing socket, unreadable parent dir,
     * unexpected platform, stat ENOTSUP on exotic filesystems) must not mask the original
     * acquisition failure. Errors are logged at debug level and swallowed.
     */
    private async crossUidDiagnostic(actionId: string): Promise<string>
    {
        if (os.platform() === 'win32')
        {
            // Named pipes on Windows have no POSIX uid ownership.
            return '';
        }

        const selfUid = process.getuid!();

        try
        {
            const st = await stat(this.lockPath);
            if (st.uid !== selfUid)
            {
                return ` Socket at ${this.lockPath} is owned by uid=${st.uid}, current uid=${selfUid}.
Another process running under a different user may still be holding this lock, or a previous process (likely run under sudo) may have left a stale socket that cannot be cleaned up automatically.
If no other processes are using this lock and you believe the socket is stale, you may need to remove it manually with elevated permissions, for example: sudo rm ${this.lockPath}`;
            }
        }
        catch (err: any)
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const code = err?.code ?? 'UNKNOWN';
            // ENOENT: socket was unlinked between acquisition failure and diagnostic; benign.
            // EACCES / EPERM: parent directory denies search; we can't classify, fall through silently.
            // Anything else: still not worth failing over; log so it's visible if someone investigates.
            if (code !== 'ENOENT')
            {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                this.logger.log(`Action: ${actionId} crossUidDiagnostic stat failed: ${code} (${String(err?.message ?? '')})`);
            }
        }
        return '';
    }
}

