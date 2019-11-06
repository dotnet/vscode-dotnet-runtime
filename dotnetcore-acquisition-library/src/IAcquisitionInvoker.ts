import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { IEventStream } from './EventStream';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionInstallError,
    DotnetAcquisitionScriptError,
    DotnetAcquisitionUnexpectedError,
} from './EventStreamEvents';

export abstract class IAcquisitionInvoker {
    protected scriptPath!: string;

    constructor(protected readonly eventStream: IEventStream) {}

    protected getInstallCommand(version: string, dotnetInstallDir: string): string {
        const args = [
            '-InstallDir', `'${dotnetInstallDir}'`, // Use single quotes instead of double quotes (see https://github.com/dotnet/cli/issues/11521)
            '-Runtime', 'dotnet',
            '-Version', version,
        ];

        return `${this.scriptPath} ${args.join(' ')}`;
    }
    protected getScriptEnding(): string {
        return os.platform() === 'win32' ? '.cmd' : '.sh';
    }

    abstract installDotnet(installDir: string, version: string, dotnetPath: string): Promise<void>
}

export class AcquisitionInvoker extends IAcquisitionInvoker {
    constructor(scriptPath: string, eventStream: IEventStream) {
        super(eventStream);
        this.scriptPath = path.join(scriptPath, 'node_modules', 'dotnetcore-acquisition-library', 'scripts', "dotnet-install" + this.getScriptEnding());
    }

    public installDotnet(dotnetInstallDir: string, version: string, dotnetPath: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                cp.exec(this.getInstallCommand(version, dotnetInstallDir), { cwd: process.cwd(), maxBuffer: 500 * 1024 }, (error, stdout, stderr) => {
                    if (error) {
                        this.eventStream.post(new DotnetAcquisitionInstallError(error, version));
                        reject(error);
                    } else if (stderr && stderr.length > 0) {
                        this.eventStream.post(new DotnetAcquisitionScriptError(stderr, version));
                        reject(stderr);
                    } else {
                        this.eventStream.post(new DotnetAcquisitionCompleted(version, dotnetPath));
                        resolve();
                    }
                });
            } catch (error) {
                this.eventStream.post(new DotnetAcquisitionUnexpectedError(error, version));
                reject(error);
            }
        });
    }
}

