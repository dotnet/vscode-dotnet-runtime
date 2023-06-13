/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import { IEvent } from './IEvent';
import { ILoggingObserver } from './ILoggingObserver';

export class LoggingObserver implements ILoggingObserver {
    private readonly log: string[] = [];

    constructor(private readonly logFilePath: string) {}

    public post(event: IEvent): void {
        this.writeLine(`${ new Date().toLocaleString() } ${ event.eventName }`);
        const properties = event.getProperties();
        if (properties) {
            for (const property of Object.values(properties)) {
                this.writeLine(property);
            }
        }
        this.writeLine('');
    }

    public dispose(): void {
        fs.writeFileSync(this.logFilePath, this.log.join('\n'));
    }

    public getFileLocation(): string {
        return this.logFilePath;
    }

    private writeLine(line: string) {
        this.log.concat(line);
    }
}
