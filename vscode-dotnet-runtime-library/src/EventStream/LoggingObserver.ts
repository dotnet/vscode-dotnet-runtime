/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { IEvent } from './IEvent';
import { ILoggingObserver } from './ILoggingObserver';

export class LoggingObserver implements ILoggingObserver
{
    private log: string[] = [];

    constructor(private readonly logFilePath: string) {}

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

    private async innerDispose(): Promise<void>
    {
        const directory = path.dirname(this.logFilePath);
        const tempFileName = `${path.basename(this.logFilePath)}.${crypto.randomUUID()}.tmp`;
        const tempFilePath = path.join(directory, tempFileName);

        await fs.promises.mkdir(directory, { recursive: true });
        await fs.promises.writeFile(tempFilePath, this.log.join('\n'), { flag: 'w' });

        const tempStats = await fs.promises.stat(tempFilePath).catch(() => null);
        const existingStats = await fs.promises.stat(this.logFilePath).catch(() => null);

        const tempSize = tempStats?.size ?? 0;
        const existingSize = existingStats?.size ?? 0;

        try
        {
            const shouldReplaceExisting = existingStats === null || tempSize > existingSize;
            if (shouldReplaceExisting)
            {
                if (existingStats)
                {
                    fs.rmSync(this.logFilePath, { force: true });
                }
                fs.renameSync(tempFilePath, this.logFilePath);
            }
        }
        finally
        {
            if (fs.existsSync(tempFilePath))
            {
                fs.rmSync(tempFilePath, { force: true });
            }
        }
    }

    public dispose(): void
    {
        this.innerDispose().catch(() => {});
    }

    public async disposeAsync(): Promise<void>
    {
        await this.innerDispose().catch(() => {});
    }

    public getFileLocation(): string
    {
        return this.logFilePath;
    }

    private writeLine(line: string)
    {
        this.log.push(line);
    }
}
