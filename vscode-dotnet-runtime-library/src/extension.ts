/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AcquisitionInvoker } from './Acquisition/AcquisitionInvoker';
import { DotnetCoreAcquisitionWorker } from './Acquisition/DotnetCoreAcquisitionWorker';
import { InstallationValidator } from './Acquisition/InstallationValidator';
import { VersionResolver } from './Acquisition/VersionResolver';
import { commandKeys, IExtensionCommandContext } from './Commands/ICommandProvider';
import { EventStream } from './EventStream/EventStream';
import { IEventStreamObserver } from './EventStream/IEventStreamObserver';
import { LoggingObserver } from './EventStream/LoggingObserver';
import { OutputChannelObserver } from './EventStream/OutputChannelObserver';
import { StatusBarObserver } from './EventStream/StatusBarObserver';
import { TelemetryObserver } from './EventStream/TelemetryObserver';
import { WindowDisplayWorker } from './EventStream/WindowDisplayWorker';
import { IExtensionConfiguration, IExtensionContext } from './IExtensionContext';
import {
    AcquireErrorConfiguration,
    ErrorConfiguration,
} from './Utils/ErrorHandler';
import { ExtensionConfigurationWorker } from './Utils/ExtensionConfigurationWorker';
import { IIssueContext } from './Utils/IIssueContext';

export namespace configKeys {
    export const installTimeoutValue = 'installTimeoutValue';
    export const enableTelemetry = 'enableTelemetry';
    export const existingPath = 'existingDotnetPath';
}

export function activate(context: vscode.ExtensionContext, extensionId: string, extensionContext: IExtensionContext) {
    const extensionConfiguration: IExtensionConfiguration = extensionContext.extensionConfiguration ?
        extensionContext.extensionConfiguration :
        vscode.workspace.getConfiguration(extensionContext.configPrefix);
    const extension = vscode.extensions.getExtension(extensionId);

    if (!extension) {
        throw new Error(`Could not resolve dotnet acquisition extension '${extensionId}' location`);
    }

    const outputChannel = vscode.window.createOutputChannel(extensionContext.displayChannelName);
    if (!fs.existsSync(context.logPath)) {
        fs.mkdirSync(context.logPath);
    }
    const logFile = path.join(context.logPath, `DotNetAcquisition-${extensionId}-${ new Date().getTime() }.txt`);
    const loggingObserver = new LoggingObserver(logFile);
    let eventStreamObservers: IEventStreamObserver[] =
        [
            new StatusBarObserver(vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_VALUE)),
            new OutputChannelObserver(outputChannel),
            loggingObserver,
        ];
    if (enableExtensionTelemetry(extensionConfiguration)) {
        eventStreamObservers = eventStreamObservers.concat(new TelemetryObserver(extensionContext.telemetryReporter));
    }
    const eventStream = new EventStream();

    for (const observer of eventStreamObservers) {
        eventStream.subscribe(event => observer.post(event));
    }

    const displayWorker = extensionContext.displayWorker ? extensionContext.displayWorker : new WindowDisplayWorker();
    const extensionConfigWorker = new ExtensionConfigurationWorker(extensionConfiguration, configKeys.existingPath);
    const issueContext = (errorConfiguration: ErrorConfiguration | undefined, commandName: string, version?: string) => {
        return {
            logger: loggingObserver,
            errorConfiguration: errorConfiguration || AcquireErrorConfiguration.DisplayAllErrorPopups,
            displayWorker,
            extensionConfigWorker,
            eventStream,
            commandName,
            version,
        } as IIssueContext;
    };
    const timeoutValue = extensionConfiguration.get<number>(configKeys.installTimeoutValue);
    const storagePath = extensionContext.storagePath ? extensionContext.storagePath : context.globalStoragePath;
    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath);
    }
    const acquisitionWorker = new DotnetCoreAcquisitionWorker({
        storagePath,
        extensionState: context.globalState,
        eventStream,
        acquisitionInvoker: new AcquisitionInvoker(context.globalState, eventStream),
        installationValidator: new InstallationValidator(eventStream),
        timeoutValue: timeoutValue === undefined ? extensionContext.defaultTimeoutValue : timeoutValue,
    });

    const showOutputChannelRegistration = vscode.commands.registerCommand(`${extensionContext.commandPrefix}.${commandKeys.showAcquisitionLog}`, () => outputChannel.show(/* preserveFocus */ false));
    context.subscriptions.push(showOutputChannelRegistration);

    const commandContext = {
        acquisitionWorker,
        extensionConfigWorker,
        displayWorker,
        versionResolver: new VersionResolver(context.globalState, eventStream),
        eventStream,
        issueContext,
    } as IExtensionCommandContext;
    const commands = extensionContext.commandProvider.GetExtensionCommands(commandContext);
    for (const command of commands) {
        const registration = vscode.commands.registerCommand(`${extensionContext.commandPrefix}.${command.name}`, command.callback);
        context.subscriptions.push(registration);
    }

    context.subscriptions.push({
        dispose: () => {
            for (const observer of eventStreamObservers) {
                observer.dispose();
            }
        },
    });
}

function enableExtensionTelemetry(extensionConfiguration: IExtensionConfiguration): boolean {
    const extensionTelemetry: boolean | undefined = extensionConfiguration.get(configKeys.enableTelemetry);
    const vscodeTelemetry: boolean | undefined = vscode.workspace.getConfiguration('telemetry').get(configKeys.enableTelemetry);
    const enableDotnetTelemetry = extensionTelemetry === undefined ? true : extensionTelemetry;
    const enableVSCodeTelemetry = vscodeTelemetry === undefined ? true : vscodeTelemetry;
    return enableVSCodeTelemetry && enableDotnetTelemetry;
}
