import { EventType } from './EventType';
export declare abstract class IEvent {
    abstract type: EventType;
    abstract readonly eventName: string;
    isError: boolean;
    abstract getProperties(telemetry?: boolean): {
        [key: string]: string;
    } | undefined;
    getSanitizedProperties(): {
        [key: string]: string;
    } | undefined;
}
