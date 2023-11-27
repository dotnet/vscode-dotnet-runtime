/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import TelemetryReporter from 'vscode-extension-telemetry';
import * as vscode from 'vscode';

import { IPackageJson } from './EventStreamRegistration';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';
import { IEventStream } from './EventStream';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { TelemetryUtilities } from './TelemetryUtilities';

export interface ITelemetryReporter {
    sendTelemetryEvent(eventName: string, properties?: { [key: string]: string }, measures?: { [key: string]: number }): void;
    sendTelemetryErrorEvent(eventName: string, properties?: { [key: string]: string }, measurements?: { [key: string]: number }, errorProps?: string[]): void;
    dispose(): Promise<void>;
}

export class TelemetryObserver implements IEventStreamObserver {
    private readonly telemetryReporter: ITelemetryReporter;
    private isExtensionTelemetryEnabled = false;
    private eventStream : IEventStream;
    private extensionContext : IVSCodeExtensionContext;
    private utilityContext : IUtilityContext;

    constructor(packageJson: IPackageJson, isExtensionTelemetryEnabled : boolean, eventStream : IEventStream,
        extensionContext : IVSCodeExtensionContext, utilContext : IUtilityContext, telemetryReporter?: ITelemetryReporter) {
        if (telemetryReporter === undefined)
        {
            const extensionVersion = packageJson.version;
            const appInsightsKey = packageJson.appInsightsKey;
            const extensionId = packageJson.name;
            this.telemetryReporter = new TelemetryReporter(extensionId, extensionVersion, appInsightsKey);
        }
        else
        {
            this.telemetryReporter = telemetryReporter;
        }

        this.isExtensionTelemetryEnabled = isExtensionTelemetryEnabled;
        this.eventStream = eventStream;
        this.extensionContext = extensionContext;
        this.utilityContext = utilContext;

        vscode.env.onDidChangeTelemetryEnabled((newIsTelemetryEnabledSetting: boolean) =>
        {
            this.isExtensionTelemetryEnabled = newIsTelemetryEnabledSetting;
            TelemetryUtilities.setDotnetSDKTelemetryToMatch(this.isExtensionTelemetryEnabled, this.extensionContext, this.eventStream, this.utilityContext);
        });
    }

    /**
     *
     * @param event The event posted to the event stream that we subscribed to.
     * @remarks The TelemetryReporter from the VSCode library contains all of the logic when we try to send an event for us.
     * It will handle whether we should send the telemetry or not. However, it is not aware of our custom telemetry logic
     * So we might as well check both to be safe.
     *
     * However, the .NET SDK itself has its own telemetry and we must keep track of VS Code's telemetry settings for that.
     */
    public post(event: IEvent): void
    {
        if(TelemetryUtilities.isTelemetryEnabled(this.isExtensionTelemetryEnabled, this.utilityContext))
        {
            const properties = event.getSanitizedProperties(); // Get properties that don't contain personally identifiable data
            if (!properties) {
                this.telemetryReporter.sendTelemetryEvent(event.eventName);
            } else if (event.isError) {
                this.telemetryReporter.sendTelemetryErrorEvent(event.eventName, properties);
            } else {
                this.telemetryReporter.sendTelemetryEvent(event.eventName, properties);
            }
        }
    }

    public dispose(): void
    {
        this.telemetryReporter.dispose();
    }
}
