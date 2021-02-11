/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as cp from 'child_process';
import * as fs from 'fs';
import open = require('open');
import * as os from 'os';
import * as vscode from 'vscode';
import {
    AcquireErrorConfiguration,
    AcquisitionInvoker,
    callWithErrorHandling,
    DotnetAcquisitionMissingLinuxDependencies,
    DotnetAcquisitionRequested,
    DotnetCoreAcquisitionWorker,
    DotnetCoreDependencyInstaller,
    DotnetExistingPathResolutionCompleted,
    enableExtensionTelemetry,
    ErrorConfiguration,
    ExtensionConfigurationWorker,
    formatIssueUrl,
    IDotnetAcquireContext,
    IDotnetAcquireResult,
    IDotnetEnsureDependenciesContext,
    IDotnetUninstallContext,
    IEventStreamContext,
    IExtensionContext,
    IIssueContext,
    InstallationValidator,
    registerEventStream,
    VersionResolver,
    WindowDisplayWorker,
} from 'vscode-dotnet-runtime-library';
import { dotnetCoreAcquisitionExtensionId } from './DotnetCoreAcquistionId';

// Extension constants
namespace configKeys {
    export const installTimeoutValue = 'installTimeoutValue';
    export const enableTelemetry = 'enableTelemetry';
    export const existingPath = 'existingDotnetPath';
}
namespace commandKeys {
    export const acquire = 'acquire';
    export const uninstallAll = 'uninstallAll';
    export const showAcquisitionLog = 'showAcquisitionLog';
    export const ensureDotnetDependencies = 'ensureDotnetDependencies';
    export const reportIssue = 'reportIssue';
}
const commandPrefix = 'dotnet';
const configPrefix = 'dotnetAcquisitionExtension';
const displayChannelName = '.NET Runtime';
const defaultTimeoutValue = 120;

export function activate(context: vscode.ExtensionContext, extensionContext?: IExtensionContext) {
    const extensionConfiguration = extensionContext !== undefined && extensionContext.extensionConfiguration ?
        extensionContext.extensionConfiguration :
        vscode.workspace.getConfiguration(configPrefix);
    const extension = vscode.extensions.getExtension(dotnetCoreAcquisitionExtensionId);

    if (!extension) {
        throw new Error(`Could not resolve dotnet acquisition extension '${dotnetCoreAcquisitionExtensionId}' location`);
    }

    const eventStreamContext = {
        displayChannelName,
        logPath: context.logPath,
        extensionId: dotnetCoreAcquisitionExtensionId,
        enableTelemetry: enableExtensionTelemetry(extensionConfiguration, configKeys.enableTelemetry),
        telemetryReporter: extensionContext ? extensionContext.telemetryReporter : undefined,
    } as IEventStreamContext;
    const [eventStream, outputChannel, loggingObserver, eventStreamObservers] = registerEventStream(eventStreamContext);

    const displayWorker = extensionContext ? extensionContext.displayWorker : new WindowDisplayWorker();
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
    if (!fs.existsSync(context.globalStoragePath)) {
        fs.mkdirSync(context.globalStoragePath);
    }
    const acquisitionWorker = new DotnetCoreAcquisitionWorker({
        storagePath: context.globalStoragePath,
        extensionState: context.globalState,
        eventStream,
        acquisitionInvoker: new AcquisitionInvoker(context.globalState, eventStream),
        installationValidator: new InstallationValidator(eventStream),
        timeoutValue: timeoutValue === undefined ? defaultTimeoutValue : timeoutValue,
    });
    const versionResolver = new VersionResolver(context.globalState, eventStream);

    const dotnetAcquireRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquire}`, async (commandContext: IDotnetAcquireContext) => {
        const dotnetPath = await callWithErrorHandling<Promise<IDotnetAcquireResult>>(async () => {
            eventStream.post(new DotnetAcquisitionRequested(commandContext.version, commandContext.requestingExtensionId));

            if (!commandContext.version || commandContext.version === 'latest') {
                throw new Error(`Cannot acquire .NET version "${commandContext.version}". Please provide a valid version.`);
            }

            const existingPath = acquisitionWorker.resolveExistingPath(extensionConfigWorker.getPathConfigurationValue(), commandContext.requestingExtensionId, displayWorker);
            if (existingPath) {
                eventStream.post(new DotnetExistingPathResolutionCompleted(existingPath.dotnetPath));
                return new Promise((resolve) => {
                    resolve(existingPath);
                });
            }

            const version = await versionResolver.getFullRuntimeVersion(commandContext.version);
            return acquisitionWorker.acquireRuntime(version);
        }, issueContext(commandContext.errorConfiguration, 'acquire', commandContext.version), commandContext.requestingExtensionId);
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
