/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import { isNullOrUndefined } from 'util';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';

export class LoggingObserver implements IEventStreamObserver {
    private log = '';

    constructor(private readonly logFilePath: string) {}

    public post(event: IEvent): void {
        this.writeLine(`${ new Date().toLocaleString() } ${ event.constructor.name }`);
        const properties = event.getProperties();
        if (!isNullOrUndefined(properties)) {
            for (const property of Object.values(properties)) {
                this.writeLine(property);
            }
        }
        this.writeLine('');
    }

    public dispose(): void {
        fs.writeFileSync(this.logFilePath, this.log);
    }

    private writeLine(line: string) {
        this.log = this.log.concat(`\n${line}`);
    }
}
