/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isNullOrUndefined } from 'util';
import TelemetryReporter from 'vscode-extension-telemetry';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';
// tslint:disable no-var-requires
const packageJson = require('../../dotnetcore-acquisition-extension/package.json');

export interface ITelemetryReporter {
    sendTelemetryEvent(eventName: string, properties?: { [key: string]: string }, measures?: { [key: string]: number }): void;
    dispose(): Promise<any>;
}

export class TelemetryObserver implements IEventStreamObserver {
    private readonly telemetryReporter: ITelemetryReporter;

    constructor(telemetryReporter?: ITelemetryReporter) {
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
        const properties = event.getProperties(true); // Get properties that don't contain personally identifiable data
        if (isNullOrUndefined(properties)) {
            this.telemetryReporter.sendTelemetryEvent(event.constructor.name);
        } else {
            this.telemetryReporter.sendTelemetryEvent(event.constructor.name, properties);
        }
    }

    public dispose(): void {
        this.telemetryReporter.dispose();
    }
}
