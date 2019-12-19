/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isNullOrUndefined } from 'util';
import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionError,
    DotnetAcquisitionStarted,
    DotnetError,
} from './EventStreamEvents';
import { EventType } from './EventType';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';
import { MockExtensionContext, MockTelemetryReporter } from './test/mocks/MockObjects';

export interface ITelemetryReporter {
    sendTelemetryEvent(eventName: string, properties?: { [key: string]: string }, measures?: { [key: string]: number }): void;
}

export class TelemetryObserver implements IEventStreamObserver {

    public static getInstance(extension: vscode.Extension<any>, context: vscode.ExtensionContext): TelemetryObserver {
        if (context.globalState instanceof MockExtensionContext) {
            // This is a test, return the mock reporter
            return new TelemetryObserver(new MockTelemetryReporter());
        } else {
            const extensionVersion = extension.packageJSON.version;
            const appInsightsKey = extension.packageJSON.appInsightsKey;
            const extensionId = extension.packageJSON.name;

            return new TelemetryObserver(new TelemetryReporter(extensionId, extensionVersion, appInsightsKey));
        }
    }

    private constructor(private readonly telemetryReporter: ITelemetryReporter) {}

    public post(event: IEvent): void {
        const properties = this.getTelemetryProperties(event);
        if (isNullOrUndefined(properties)) {
            this.telemetryReporter.sendTelemetryEvent(event.constructor.name);
        } else {
            this.telemetryReporter.sendTelemetryEvent(event.constructor.name, properties);
        }
    }

    private getTelemetryProperties(event: IEvent): { [key: string]: string } | undefined {
        switch (event.type) {
            case EventType.DotnetAcquisitionStart:
                return {AcquisitionStartVersion : (event as DotnetAcquisitionStarted).version};

            case EventType.DotnetAcquisitionCompleted:
                return {AcquisitionCompletedVersion : (event as DotnetAcquisitionCompleted).version,
                        AcquisitionCompletedDotnetPath : (event as DotnetAcquisitionCompleted).dotnetPath};
            case EventType.DotnetError:
                if (event instanceof DotnetAcquisitionError) {
                    return {ErrorMessage : (event as DotnetAcquisitionError).error,
                            AcquisitionErrorVersion : (event as DotnetAcquisitionError).version};
                } else {
                    return {ErrorMessage : (event as DotnetError).error};
                }
            default:
                // The rest of the events have no properties
                return undefined;
        }
    }
}
