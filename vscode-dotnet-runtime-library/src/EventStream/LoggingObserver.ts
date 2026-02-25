/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import { IEvent } from './IEvent';
import { ILoggingObserver } from './ILoggingObserver';

export class LoggingObserver implements ILoggingObserver
{
    private static readonly defaultFlushIntervalMs = 30_000;
    private static readonly maxFlushIntervalMs = 300_000; // 5 minutes cap

    private log: string[] = [];
    private flushTimer: NodeJS.Timeout | undefined;
    private directoryEnsured = false;
    private baseFlushIntervalMs: number;
    private currentFlushIntervalMs: number;

    /**
     * Serializes all flush operations so concurrent flush()/dispose() calls
     * don't race on file I/O. Each flush appends to the chain.
     * Safe because JS is single-threaded for synchronous code:
     *   - The buffer swap (this.log = []) is atomic w.r.t. post() calls.
     *   - The promise chain ensures only one appendFile is in-flight at a time.
     */
    private flushChain: Promise<void> = Promise.resolve();

    constructor(private readonly logFilePath: string, flushIntervalMs?: number)
    {
        this.baseFlushIntervalMs = flushIntervalMs ?? LoggingObserver.defaultFlushIntervalMs;
        this.currentFlushIntervalMs = this.baseFlushIntervalMs;
        this.scheduleNextFlush();
    }

    public post(event: IEvent): void
    {
        const actionIdSegment = event.actionId ? ` [${event.actionId}]` : '';
        this.writeLine(`${new Date().toLocaleString()} ${new Date().getMilliseconds()}${actionIdSegment} ${event.eventName}`);
        const properties = event.getProperties();
        if (properties)
        {
            for (const property of Object.values(properties))
            {
                this.writeLine(property);
            }
        }
        this.writeLine('');
    }

    /**
     * Force an immediate flush of buffered log entries to disk.
     * Safe to call concurrently — flushes are serialized internally.
     */
    public async flush(): Promise<void>
    {
        // Atomically swap the buffer so post() writes to a fresh array.
        // This is safe because the swap is synchronous and JS is single-threaded.
        const toWrite = this.log;
        this.log = [];

        if (toWrite.length === 0)
        {
            // Nothing to write — back off: double the interval up to the cap.
            this.currentFlushIntervalMs = Math.min(
                this.currentFlushIntervalMs * 2,
                LoggingObserver.maxFlushIntervalMs
            );
            return;
        }

        // Had data to write — reset to the base interval.
        this.currentFlushIntervalMs = this.baseFlushIntervalMs;

        // Chain this flush after any in-flight flush to serialize file I/O.
        const writePromise = this.flushChain.then(async () =>
        {
            await this.ensureDirectory();
            await fs.promises.appendFile(this.logFilePath, toWrite.join('\n') + '\n');
        }).catch(() => {});

        this.flushChain = writePromise;
        await writePromise;
    }

    /**
     * Flushes buffered log entries to disk (fire-and-forget).
     * Does NOT stop the logger — post() continues to work after dispose().
     * This matches the extension's usage where dispose() is called after each
     * command completes, but the same observer instance is reused.
     */
    public dispose(): void
    {
        this.flush().catch(() => {});
    }

    public async disposeAsync(): Promise<void>
    {
        await this.flush();
    }

    /**
     * Permanently shuts down the observer: flushes remaining entries and stops
     * the periodic timer. Use this only at extension deactivation.
     */
    public async shutdown(): Promise<void>
    {
        this.stopPeriodicFlush();
        await this.flush();
    }

    public getFileLocation(): string
    {
        return this.logFilePath;
    }

    private writeLine(line: string): void
    {
        this.log.push(line);
    }

    /**
     * Schedules the next flush using setTimeout so the delay can vary.
     * After each tick: flush, then schedule the next one.
     * If the flush was empty, the interval doubles (exponential backoff, capped).
     * If the flush had data, the interval resets to the base value.
     */
    private scheduleNextFlush(): void
    {
        this.flushTimer = setTimeout(() =>
        {
            this.flush().catch(() => {}).finally(() =>
            {
                // Only reschedule if we haven't been shut down.
                if (this.flushTimer !== undefined)
                {
                    this.scheduleNextFlush();
                }
            });
        }, this.currentFlushIntervalMs);

        // Don't let the timer keep the Node process alive (relevant for tests).
        if (this.flushTimer.unref)
        {
            this.flushTimer.unref();
        }
    }

    private stopPeriodicFlush(): void
    {
        if (this.flushTimer !== undefined)
        {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
    }

    private async ensureDirectory(): Promise<void>
    {
        if (!this.directoryEnsured)
        {
            const directory = path.dirname(this.logFilePath);
            await fs.promises.mkdir(directory, { recursive: true });
            this.directoryEnsured = true;
        }
    }
}
