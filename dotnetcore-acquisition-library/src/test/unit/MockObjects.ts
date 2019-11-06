import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Memento } from 'vscode';
import { IEventStream } from '../../EventStream';
import { IEvent } from '../../IEvent';
import { IAcquisitionInvoker } from '../../IAcquisitionInvoker';
import { DotnetAcquisitionCompleted } from '../../EventStreamEvents';

export class MockExtensionContext implements Memento {
    private values: { [n: string]: any; } = {};
    
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get(key: any, defaultValue?: any) {
        let value = this.values![key];
		if (typeof value === 'undefined') {
			value = defaultValue;
		}
		return value;
    }
    update(key: string, value: any): Thenable<void> {
        return this.values[key] = value;
    }
}

export class MockEventStream implements IEventStream {
    public events : IEvent[] = [];
    public post(event: IEvent) {
        this.events = this.events.concat(event);
    }
}

export class NoInstallAcquisitionInvoker extends IAcquisitionInvoker {
    public installDotnet(dotnetInstallDir: string, version: string, dotnetPath: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // Write a file to mock the download
            const fileToWrite = os.platform() === 'win32' ? "dotnet.exe" : "dotnet"
            if (!fs.existsSync(dotnetInstallDir)) {
                fs.mkdirSync(dotnetInstallDir, { recursive: true });
            }
            if (!fs.existsSync(fileToWrite)) {
                fs.writeFileSync(path.join(dotnetInstallDir, fileToWrite), "");
            }
            this.eventStream.post(new DotnetAcquisitionCompleted(version, dotnetPath));
            resolve();

        });
    }
}