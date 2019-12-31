/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isNullOrUndefined } from 'util';
import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';
import { MockExtensionContext, MockTelemetryReporter } from './test/mocks/MockObjects';
// tslint:disable no-var-requires
const packageJson = require('../../dotnetcore-acquisition-extension/package.json');

export interface ITelemetryReporter {
    sendTelemetryEvent(eventName: string, properties?: { [key: string]: string }, measures?: { [key: string]: number }): void;
    dispose(): Promise<any>;
}

export class TelemetryObserver implements IEventStreamObserver {
    public static getInstance(context: vscode.ExtensionContext): TelemetryObserver {
        if (context.globalState instanceof MockExtensionContext) {
            // This is a test, use the mock reporter
            return new TelemetryObserver(new MockTelemetryReporter());
        } else {
            const extensionVersion = packageJson.version;
            const appInsightsKey = packageJson.appInsightsKey;
            const extensionId = packageJson.name;

            return new TelemetryObserver(new TelemetryReporter(extensionId, extensionVersion, appInsightsKey));
        }
    }

    private constructor(private readonly telemetryReporter: ITelemetryReporter) {}

    public post(event: IEvent): void {
        const properties = event.getProperties();
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
