import { IEventStream } from './EventStream';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';

export abstract class IAcquisitionInvoker {
    constructor(protected readonly eventStream: IEventStream) {}

    abstract installDotnet(installContext: IDotnetInstallationContext): Promise<void>
}
