/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import TelemetryReporter from 'vscode-extension-telemetry';
import { IPackageJson } from './EventStreamRegistration';
import { IEvent } from './IEvent';
import { IEventStreamObserver } from './IEventStreamObserver';
import * as vscode from 'vscode';
import { IEventStream } from './EventStream';
import { DotnetTelemetrySettingEvent } from './EventStreamEvents';
import { CommandExecutor } from '../Utils/CommandExecutor';
import { ICommandExecutor } from '../Utils/ICommandExecutor';

export interface ITelemetryReporter {
    sendTelemetryEvent(eventName: string, properties?: { [key: string]: string }, measures?: { [key: string]: number }): void;
    sendTelemetryErrorEvent(eventName: string, properties?: { [key: string]: string }, measurements?: { [key: string]: number }, errorProps?: string[]): void;
    dispose(): Promise<void>;
}

export class TelemetryObserver implements IEventStreamObserver {
    private readonly telemetryReporter: ITelemetryReporter;
    private isExtensionTelemetryEnabled = false;
    private eventStream : IEventStream;

    constructor(packageJson: IPackageJson, isExtensionTelemetryEnabled : boolean, eventStream : IEventStream, telemetryReporter?: ITelemetryReporter, ) {
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

        vscode.env.onDidChangeTelemetryEnabled((newIsTelemetryEnabledSetting: boolean) =>
        {
            this.isExtensionTelemetryEnabled = newIsTelemetryEnabledSetting;
            TelemetryObserver.setDotnetSDKTelemetryToMatch(this.isExtensionTelemetryEnabled, this.eventStream);
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
        if(TelemetryObserver.isTelemetryEnabled(this.isExtensionTelemetryEnabled))
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

    static setDotnetSDKTelemetryToMatch(isExtensionTelemetryEnabled : boolean, eventStream : IEventStream)
    {
        if(!TelemetryObserver.isTelemetryEnabled(isExtensionTelemetryEnabled))
        {
            TelemetryObserver.logTelemetryChange(`Before disabling .NET SDK telemetry:`, isExtensionTelemetryEnabled, eventStream);

            new CommandExecutor(eventStream).setEnvironmentVariable(
                'DOTNET_CLI_TELEMETRY_OPTOUT',
                'true',

`Telemetry is disabled for the .NET Install Tool, but we were unable to turn off the .NET SDK telemetry.
Please verify that .NET SDK telemetry is disabled as well by setting the environment variable DOTNET_CLI_TELEMETRY_OPTOUT to true.`,

`The .NET Install Tool will not collect telemetry. However, the .NET SDK does collect telemetry.
To disable .NET SDK telemetry, please set the environment variable DOTNET_CLI_TELEMETRY_OPTOUT to true.`);

            TelemetryObserver.logTelemetryChange(`After disabling .NET SDK telemetry:`, isExtensionTelemetryEnabled, eventStream);
        }
        else
        {
            TelemetryObserver.logTelemetryChange(`Unchanged Telemetry Settings.`, isExtensionTelemetryEnabled, eventStream);
        }
    }

    static isDotnetSDKTelemetryDisabled()
    {
        const optOut = process.env.DOTNET_CLI_TELEMETRY_OPTOUT;
        return optOut && optOut !== 'false' && optOut !== '0';
    }

    static isTelemetryEnabled(isExtensionTelemetryEnabled : boolean)
    {
        const isVSCodeTelemetryEnabled = vscode.env.isTelemetryEnabled;
        return isVSCodeTelemetryEnabled && isExtensionTelemetryEnabled;
    }

    static logTelemetryChange(changeMessage : string, isExtensionTelemetryEnabled : boolean, eventStream : IEventStream) : void
    {
        eventStream.post(new DotnetTelemetrySettingEvent(`Telemetry Setting Change: ${changeMessage}
.NET SDK Setting: ${!TelemetryObserver.isDotnetSDKTelemetryDisabled()},
Extension Setting: ${isExtensionTelemetryEnabled}
VS Code Setting: ${vscode.env.isTelemetryEnabled}.`))
    }
}
