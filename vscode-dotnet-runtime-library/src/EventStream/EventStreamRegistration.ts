/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IExtensionConfiguration } from '../IExtensionContext';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';
import { IUtilityContext } from '../Utils/IUtilityContext';
import { EventStream } from './EventStream';
import { IEventStreamObserver } from './IEventStreamObserver';
import { LoggingObserver } from './LoggingObserver';
import { ModalEventRepublisher } from './ModalEventPublisher';
import { OutputChannelObserver } from './OutputChannelObserver';
import { StatusBarObserver } from './StatusBarObserver';
import { ITelemetryReporter, TelemetryObserver } from './TelemetryObserver';

export interface IPackageJson
{
    version: string;
    connectionString: string;
    name: string;
}

export interface IEventStreamContext
{
    displayChannelName: string;
    logPath: string;
    extensionId: string;
    enableTelemetry: boolean;
    telemetryReporter: ITelemetryReporter | undefined;
    showLogCommand: string;
    packageJson: IPackageJson;
}

export function registerEventStream(context: IEventStreamContext, extensionContext: IVSCodeExtensionContext,
    utilityContext: IUtilityContext): [EventStream, vscode.OutputChannel, LoggingObserver, IEventStreamObserver[], TelemetryObserver | null, ModalEventRepublisher]
{
    const outputChannel = vscode.window.createOutputChannel(context.displayChannelName);
    if (!fs.existsSync(context.logPath))
    {
        fs.mkdirSync(context.logPath, { recursive: true });
    }

    const logFile = path.join(context.logPath, `DotNetAcquisition-${context.extensionId}-${new Date().getTime()}.txt`);
    const loggingObserver = new LoggingObserver(logFile);
    const eventStreamObservers: IEventStreamObserver[] =
        [
            new StatusBarObserver(vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_VALUE), context.showLogCommand),
            new OutputChannelObserver(outputChannel),
            loggingObserver
        ];

    const eventStream = new EventStream();
    for (const observer of eventStreamObservers)
    {
        eventStream.subscribe(event => observer.post(event));
    }

    let telemetryObserver: TelemetryObserver | null = null;
    if (context.enableTelemetry)
    {
        telemetryObserver = new TelemetryObserver(context.packageJson, context.enableTelemetry, extensionContext, utilityContext, context.telemetryReporter);
        eventStream.subscribe(event => telemetryObserver!.post(event));
    }

    const modalEventObserver = new ModalEventRepublisher(eventStream);
    eventStream.subscribe(event => modalEventObserver.post(event));

    return [eventStream, outputChannel, loggingObserver, eventStreamObservers, telemetryObserver, modalEventObserver];
}

export function enableExtensionTelemetry(extensionConfiguration: IExtensionConfiguration, enableTelemetryKey: string): boolean
{
    const extensionTelemetry: boolean | undefined = extensionConfiguration.get(enableTelemetryKey);
    const vscodeTelemetry: boolean | undefined = vscode.workspace.getConfiguration('telemetry').get(enableTelemetryKey);
    const enableDotnetTelemetry = extensionTelemetry === undefined ? true : extensionTelemetry;
    const enableVSCodeTelemetry = vscodeTelemetry === undefined ? true : vscodeTelemetry;
    return enableVSCodeTelemetry && enableDotnetTelemetry;
}