/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import * as fs from 'fs';
import open = require('open');
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AcquisitionInvoker } from './Acquisition/AcquisitionInvoker';
import { DotnetCoreAcquisitionWorker } from './Acquisition/DotnetCoreAcquisitionWorker';
import { DotnetCoreDependencyInstaller } from './Acquisition/DotnetCoreDependencyInstaller';
import { InstallationValidator } from './Acquisition/InstallationValidator';
import { VersionResolver } from './Acquisition/VersionResolver';
import { EventStream } from './EventStream/EventStream';
import {
    DotnetAcquisitionMissingLinuxDependencies,
    DotnetExistingPathResolutionCompleted,
} from './EventStream/EventStreamEvents';
import { IEventStreamObserver } from './EventStream/IEventStreamObserver';
import { LoggingObserver } from './EventStream/LoggingObserver';
import { OutputChannelObserver } from './EventStream/OutputChannelObserver';
import { StatusBarObserver } from './EventStream/StatusBarObserver';
import { TelemetryObserver } from './EventStream/TelemetryObserver';
import { WindowDisplayWorker } from './EventStream/WindowDisplayWorker';
import { IDotnetAcquireContext } from './IDotnetAcquireContext';
import { IDotnetAcquireResult } from './IDotnetAcquireResult';
import { IDotnetEnsureDependenciesContext } from './IDotnetEnsureDependenciesContext';
import { IDotnetUninstallContext } from './IDotnetUninstallContext';
import { IExistingPath, IExtensionConfiguration, IExtensionContext } from './IExtensionContext';
import {
    AcquireErrorConfiguration,
    ErrorConfiguration,
} from './Utils/ErrorHandler';
import { callWithErrorHandling } from './Utils/ErrorHandler';
import { IIssueContext } from './Utils/IIssueContext';
import { formatIssueUrl } from './Utils/IssueReporter';

export const commandPrefix = 'dotnet'; // Prefix for commands

export namespace commandKeys {
    export const acquire = 'acquire';
    export const uninstallAll = 'uninstallAll';
    export const showAcquisitionLog = 'showAcquisitionLog';
    export const ensureDotnetDependencies = 'ensureDotnetDependencies';
    export const reportIssue = 'reportIssue';
}

export const configPrefix = 'dotnetAcquisitionExtension'; // Prefix for user settings

export namespace configKeys {
    export const installTimeoutValue = 'installTimeoutValue';
    export const enableTelemetry = 'enableTelemetry';
    export const existingPath = 'existingDotnetPath';
}

export function activate(context: vscode.ExtensionContext, parentExtensionId: string, extensionContext?: IExtensionContext) {
    const extensionConfiguration = extensionContext !== undefined && extensionContext.extensionConfiguration ?
        extensionContext.extensionConfiguration :
        vscode.workspace.getConfiguration(configPrefix);
    const extension = vscode.extensions.getExtension(parentExtensionId);

    if (!extension) {
        throw new Error(`Could not resolve dotnet acquisition extension '${parentExtensionId}' location`);
    }

    const outputChannel = vscode.window.createOutputChannel('.NET Core Runtime');
    if (!fs.existsSync(context.logPath)) {
        fs.mkdirSync(context.logPath);
    }
    const logFile = path.join(context.logPath, `DotNetAcquisition${ new Date().getTime() }.txt`);
    const loggingObserver = new LoggingObserver(logFile);
    let eventStreamObservers: IEventStreamObserver[] =
        [
            new StatusBarObserver(vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_VALUE)),
            new OutputChannelObserver(outputChannel),
            loggingObserver,
        ];
    if (enableExtensionTelemetry(extensionConfiguration)) {
        eventStreamObservers = eventStreamObservers.concat(new TelemetryObserver(extensionContext ? extensionContext.telemetryReporter : undefined));
    }
    const eventStream = new EventStream();

    for (const observer of eventStreamObservers) {
        eventStream.subscribe(event => observer.post(event));
    }

    const issueContext = (errorConfiguration: ErrorConfiguration | undefined, commandName: string) => {
        return {
            logger: loggingObserver,
            errorConfiguration: errorConfiguration || AcquireErrorConfiguration.DisplayAllErrorPopups,
            displayWorker: new WindowDisplayWorker(),
            eventStream,
            commandName,
        } as IIssueContext;
    };
    const timeoutValue = extensionConfiguration.get<number>(configKeys.installTimeoutValue);
    if (!fs.existsSync(context.globalStoragePath)) {
        fs.mkdirSync(context.globalStoragePath);
    }
    const acquisitionWorker = new DotnetCoreAcquisitionWorker({
        storagePath: context.globalStoragePath,
        extensionState: context.globalState,
        eventStream,
        acquisitionInvoker: new AcquisitionInvoker(context.globalState, eventStream),
        versionResolver: new VersionResolver(context.globalState, eventStream),
        installationValidator: new InstallationValidator(eventStream),
        timeoutValue: timeoutValue === undefined ? 120 : timeoutValue,
    });

    const dotnetAcquireRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquire}`, async (commandContext: IDotnetAcquireContext) => {
        const dotnetPath = await callWithErrorHandling<Promise<IDotnetAcquireResult>>(async () => {
            if (!commandContext.version || commandContext.version === 'latest') {
                throw new Error(`Cannot acquire .NET Core version "${commandContext.version}". Please provide a valid version.`);
            }

            const existingPath = acquisitionWorker.resolveExistingPath(extensionConfiguration.get<IExistingPath[]>(configKeys.existingPath), commandContext.version);
            if (existingPath) {
                eventStream.post(new DotnetExistingPathResolutionCompleted(existingPath.dotnetPath));
                return new Promise((resolve) => {
                    resolve(existingPath);
                });
            }

            return acquisitionWorker.acquire(commandContext.version);
        }, issueContext(commandContext.errorConfiguration, 'acquire'));
        return dotnetPath;
    });
    const dotnetUninstallAllRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.uninstallAll}`, async (commandContext: IDotnetUninstallContext | undefined) => {
        await callWithErrorHandling(() => acquisitionWorker.uninstallAll(), issueContext(commandContext ? commandContext.errorConfiguration : undefined, 'uninstallAll'));
    });
    const showOutputChannelRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.showAcquisitionLog}`, () => outputChannel.show(/* preserveFocus */ false));
    const ensureDependenciesRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.ensureDotnetDependencies}`, async (commandContext: IDotnetEnsureDependenciesContext) => {
        await callWithErrorHandling(async () => {
            if (os.platform() !== 'linux') {
                // We can't handle installing dependencies for anything other than Linux
                return;
            }

            const result = cp.spawnSync(commandContext.command, commandContext.arguments);
            const installer = new DotnetCoreDependencyInstaller();
            if (installer.signalIndicatesMissingLinuxDependencies(result.signal)) {
                eventStream.post(new DotnetAcquisitionMissingLinuxDependencies());
                await installer.promptLinuxDependencyInstall('Failed to run .NET runtime.');
            }
        }, issueContext(commandContext.errorConfiguration, 'ensureDependencies'));
    });
    const reportIssueRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.reportIssue}`, async () => {
        const [url, issueBody] = formatIssueUrl(undefined, issueContext(AcquireErrorConfiguration.DisableErrorPopups, 'reportIssue'));
        await vscode.env.clipboard.writeText(issueBody);
        open(url);
    });

    context.subscriptions.push(
        dotnetAcquireRegistration,
        dotnetUninstallAllRegistration,
        showOutputChannelRegistration,
        ensureDependenciesRegistration,
        reportIssueRegistration);

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
