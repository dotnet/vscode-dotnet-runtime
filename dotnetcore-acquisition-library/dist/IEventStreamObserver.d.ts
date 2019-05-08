import { IEvent } from './IEvent';
export interface IEventStreamObserver {
    post(event: IEvent): void;
}
