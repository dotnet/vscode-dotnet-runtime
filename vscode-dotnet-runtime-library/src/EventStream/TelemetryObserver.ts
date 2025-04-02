/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import TelemetryReporter from '@vscode/extension-telemetry';
import * as vscode from 'vscode';

import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { IPackageJson } from './EventStreamRegistration';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';
import { TelemetryUtilities } from './TelemetryUtilities';

export interface ITelemetryReporter
{
    sendTelemetryEvent(eventName: string, properties?: { [key: string]: string }, measures?: { [key: string]: number }): void;
    sendTelemetryErrorEvent(eventName: string, properties?: { [key: string]: string }, measurements?: { [key: string]: number }, errorProps?: string[]): void;
    dispose(): Promise<void>;
}

export class TelemetryObserver implements IEventStreamObserver
{
    private readonly telemetryReporter: ITelemetryReporter;
    private isExtensionTelemetryEnabled = false;
    private acquisitionContext: IAcquisitionWorkerContext | null = null;

    constructor(packageJson: IPackageJson, isExtensionTelemetryEnabled: boolean, private readonly extensionContext: IVSCodeExtensionContext,
        private readonly utilityContext: IUtilityContext, telemetryReporter?: ITelemetryReporter)
    {
        if (telemetryReporter === undefined)
        {
            const connectionString: string = packageJson.connectionString;
            this.telemetryReporter = new TelemetryReporter(connectionString ?? '');
        }
        else
        {
            this.telemetryReporter = telemetryReporter;
        }

        this.isExtensionTelemetryEnabled = isExtensionTelemetryEnabled;

        vscode.env.onDidChangeTelemetryEnabled((newIsTelemetryEnabledSetting: boolean) =>
        {
            this.isExtensionTelemetryEnabled = newIsTelemetryEnabledSetting;
            TelemetryUtilities.setDotnetSDKTelemetryToMatch(this.isExtensionTelemetryEnabled, this.extensionContext, this.acquisitionContext, this.utilityContext).catch(() => {});
        });
    }

    public setAcquisitionContext(context: IAcquisitionWorkerContext, underlyingAcquisitionContext: IDotnetAcquireContext)
    {
        context.acquisitionContext = underlyingAcquisitionContext;
        this.acquisitionContext = context;
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
        if (TelemetryUtilities.isTelemetryEnabled(this.isExtensionTelemetryEnabled, this.utilityContext))
        {
            const properties = event.getSanitizedProperties(); // Get properties that don't contain personally identifiable data

            // Certain events get sent way too often (ex: 700 million locks acquired over a few months which is causing problems for the data team) and aren't useful for telemetry.
            // We allow suppressing certain events before even hitting the data ingestion service by doing a check here.
            if (properties && properties?.suppressTelemetry === 'true')
            {
                return;
            }

            if (!properties)
            {
                this.telemetryReporter.sendTelemetryEvent(event.eventName);
            } else if (event.isError)
            {
                this.telemetryReporter.sendTelemetryErrorEvent(event.eventName, properties);
            } else
            {
                this.telemetryReporter.sendTelemetryEvent(event.eventName, properties);
            }
        }
    }

    public dispose(): void
    {
        this.telemetryReporter.dispose().catch(() => {});
    }
}
