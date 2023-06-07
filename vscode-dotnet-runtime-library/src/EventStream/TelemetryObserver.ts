/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import TelemetryReporter from 'vscode-extension-telemetry';
import { IPackageJson } from './EventStreamRegistration';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';

export interface ITelemetryReporter {
    sendTelemetryEvent(eventName: string, properties?: { [key: string]: string }, measures?: { [key: string]: number }): void;
    sendTelemetryErrorEvent(eventName: string, properties?: { [key: string]: string }, measurements?: { [key: string]: number }, errorProps?: string[]): void;
    dispose(): Promise<void>;
}

export class TelemetryObserver implements IEventStreamObserver {
    private readonly telemetryReporter: ITelemetryReporter;

    constructor(packageJson: IPackageJson, telemetryReporter?: ITelemetryReporter) {
        if (telemetryReporter === undefined) {
            const extensionVersion = packageJson.version;
            const appInsightsKey = packageJson.appInsightsKey;
            const extensionId = packageJson.name;
            this.telemetryReporter = new TelemetryReporter(extensionId, extensionVersion, appInsightsKey);
        } else {
            this.telemetryReporter = telemetryReporter;
        }
    }

    public post(event: IEvent): void {
        const properties = event.getSanitizedProperties(); // Get properties that don't contain personally identifiable data
        if (!properties) {
            this.telemetryReporter.sendTelemetryEvent(event.eventName);
        } else if (event.isError) {
            this.telemetryReporter.sendTelemetryErrorEvent(event.eventName, properties);
        } else {
            this.telemetryReporter.sendTelemetryEvent(event.eventName, properties);
        }
    }

    public dispose(): void {
        this.telemetryReporter.dispose();
    }
}
