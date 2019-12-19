/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as path from 'path';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionError,
    DotnetAcquisitionStarted,
    DotnetError,
} from './EventStreamEvents';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';

export class LoggingObserver implements IEventStreamObserver {
    private log = '';
    private readonly logFilePath: string;

    constructor(filePath: string, fileName: string) {
        this.logFilePath = path.join(filePath, fileName);
    }

    public post(event: IEvent): void {
        this.writeLine(`${ new Date().toLocaleString() } ${ event.constructor.name }`);
        switch (event.type) {
            case EventType.DotnetAcquisitionStart:
                this.writeLine((event as DotnetAcquisitionStarted).version);
                break;
            case EventType.DotnetAcquisitionCompleted:
                this.writeLine((event as DotnetAcquisitionCompleted).version);
                this.writeLine((event as DotnetAcquisitionCompleted).dotnetPath);
                break;
            case EventType.DotnetError:
                if (event instanceof DotnetAcquisitionError) {
                    this.writeLine((event as DotnetAcquisitionError).version);
                    this.writeLine((event as DotnetAcquisitionError).error);
                } else {
                    this.writeLine((event as DotnetError).error);
                }
                break;
        }
        this.writeLine('');
        this.writeFile();
    }

    public writeFile() {
        fs.writeFileSync(this.logFilePath, this.log);
    }

    private writeLine(line: string) {
        this.log = this.log.concat(`\n${line}`);
    }
}
