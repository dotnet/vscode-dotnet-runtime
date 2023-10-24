/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IExtensionConfiguration, IExtensionContext } from '../IExtensionContext';
import { EventStream } from './EventStream';
import { IEventStreamObserver } from './IEventStreamObserver';
import { LoggingObserver } from './LoggingObserver';
import { OutputChannelObserver } from './OutputChannelObserver';
import { StatusBarObserver } from './StatusBarObserver';
import { ITelemetryReporter, TelemetryObserver } from './TelemetryObserver';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { IUtilityContext } from '../Utils/IUtilityContext';

export interface IPackageJson {
    version: string;
    appInsightsKey: string;
    name: string;
}

export interface IEventStreamContext {
    displayChannelName: string;
    logPath: string;
    extensionId: string;
    enableTelemetry: boolean;
    telemetryReporter: ITelemetryReporter | undefined;
    showLogCommand: string;
    packageJson: IPackageJson;
}

export function registerEventStream(context: IEventStreamContext, extensionContext : IVSCodeExtensionContext, utilityContext : IUtilityContext): [EventStream, vscode.OutputChannel, LoggingObserver, IEventStreamObserver[]]
{
    const outputChannel = vscode.window.createOutputChannel(context.displayChannelName);
    if (!fs.existsSync(context.logPath))
    {
        fs.mkdirSync(context.logPath);
    }

    const logFile = path.join(context.logPath, `DotNetAcquisition-${context.extensionId}-${ new Date().getTime() }.txt`);
    const loggingObserver = new LoggingObserver(logFile);
    const eventStreamObservers: IEventStreamObserver[] =
    [
        new StatusBarObserver(vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_VALUE), context.showLogCommand),
        new OutputChannelObserver(outputChannel),
        loggingObserver,
    ];

    const eventStream = new EventStream();
    for (const observer of eventStreamObservers)
    {
        eventStream.subscribe(event => observer.post(event));
    }

    if (context.enableTelemetry) {
        const telemetryObserver = new TelemetryObserver(context.packageJson, context.enableTelemetry, eventStream, extensionContext, utilityContext, context.telemetryReporter);
        eventStream.subscribe(event => telemetryObserver.post(event));
    }

    return [eventStream, outputChannel, loggingObserver, eventStreamObservers];
}

export function enableExtensionTelemetry(extensionConfiguration: IExtensionConfiguration, enableTelemetryKey: string): boolean {
    const extensionTelemetry: boolean | undefined = extensionConfiguration.get(enableTelemetryKey);
    const vscodeTelemetry: boolean | undefined = vscode.workspace.getConfiguration('telemetry').get(enableTelemetryKey);
    const enableDotnetTelemetry = extensionTelemetry === undefined ? true : extensionTelemetry;
    const enableVSCodeTelemetry = vscodeTelemetry === undefined ? true : vscodeTelemetry;
    return enableVSCodeTelemetry && enableDotnetTelemetry;
}