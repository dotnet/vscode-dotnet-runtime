/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AcquisitionInvoker } from './AcquisitionInvoker';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { DotnetCoreDependencyInstaller } from './DotnetCoreDependencyInstaller';
import { EventStream } from './EventStream';
import { DotnetAcquisitionMissingLinuxDependencies } from './EventStreamEvents';
import { IEventStreamObserver } from './IEventStreamObserver';
import { LoggingObserver } from './LoggingObserver';
import { OutputChannelObserver } from './OutputChannelObserver';
import { StatusBarObserver } from './StatusBarObserver';
import { TelemetryObserver } from './TelemetryObserver';
import { VersionResolver } from './VersionResolver';

export function activate(context: vscode.ExtensionContext, parentExtensionId: string) {
    const extension = vscode.extensions.getExtension(parentExtensionId);

    if (!extension) {
        throw new Error(`Could not resolve dotnet acquisition extension '${parentExtensionId}' location`);
    }

    const outputChannel = vscode.window.createOutputChannel('.NET Core Tooling');
    fs.mkdirSync(context.logPath);
    const logFile = path.join(context.logPath, `DotNetAcquisition${ new Date().getTime() }.txt`);
    const eventStreamObservers: IEventStreamObserver[] =
        [
            new StatusBarObserver(vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, Number.MIN_VALUE)),
            new OutputChannelObserver(outputChannel),
            TelemetryObserver.getInstance(context),
            new LoggingObserver(logFile),
        ];
    const eventStream = new EventStream();

    for (const observer of eventStreamObservers) {
        eventStream.subscribe(event => observer.post(event));
    }

    if (!fs.existsSync(context.globalStoragePath)) {
        fs.mkdirSync(context.globalStoragePath);
    }
    const acquisitionInvoker = new AcquisitionInvoker(context.globalState, eventStream);
    const versionResolver = new VersionResolver(context.globalState, eventStream);
    const acquisitionWorker = new DotnetCoreAcquisitionWorker(
        context.globalStoragePath,
        context.globalState,
        eventStream,
        acquisitionInvoker,
        versionResolver);

    const dotnetAcquireRegistration = vscode.commands.registerCommand('dotnet.acquire', async (version) => {
        if (!version || version === 'latest') {
            throw new Error(`Cannot acquire .NET Core version "${version}". Please provide a valid version.`);
        }
        return acquisitionWorker.acquire(version);
    });
    const dotnetUninstallAllRegistration = vscode.commands.registerCommand('dotnet.uninstallAll', () => acquisitionWorker.uninstallAll());
    const showOutputChannelRegistration = vscode.commands.registerCommand('dotnet.showAcquisitionLog', () => outputChannel.show(/* preserveFocus */ false));
    const testApplicationRegistration = vscode.commands.registerCommand('dotnet.ensureDotnetDependencies', async (app, args) => {
        if (os.platform() !== 'linux') {
            // We can't handle installing dependencies for anything other than Linux
            return;
        }

        const result = cp.spawnSync(app, args);
        const installer = new DotnetCoreDependencyInstaller();
        if (installer.signalIndicatesMissingLinuxDependencies(result.signal)) {
            eventStream.post(new DotnetAcquisitionMissingLinuxDependencies());
            await installer.promptLinuxDependencyInstall('Failed to run .NET tooling.');
        }

        // TODO: Handle cases where .NET failed for unknown reasons.
    });

    context.subscriptions.push(
        dotnetAcquireRegistration,
        dotnetUninstallAllRegistration,
        showOutputChannelRegistration,
        testApplicationRegistration);

    context.subscriptions.push({
        dispose: () => {
            for (const observer of eventStreamObservers) {
                observer.dispose();
            }
        },
    });
}
