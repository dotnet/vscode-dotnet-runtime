import { IEventStream } from '../EventStream/EventStream';
import { IDotnetInstallationContext } from './IDotnetInstallationContext';
import { IInstallationValidator } from './IInstallationValidator';
export declare abstract class IAcquisitionInvoker {
    protected readonly eventStream: IEventStream;
    readonly installationValidator: IInstallationValidator;
    constructor(eventStream: IEventStream);
    abstract installDotnet(installContext: IDotnetInstallationContext): Promise<void>;
}
