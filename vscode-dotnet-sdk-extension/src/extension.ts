/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as fs from 'fs';
import open = require('open');
import * as os from 'os';
import * as vscode from 'vscode';
import {
    AcquireErrorConfiguration,
    AcquisitionInvoker,
    callWithErrorHandling,
    DotnetAcquisitionRequested,
    DotnetCoreAcquisitionWorker,
    DotnetSDKAcquisitionStarted,
    enableExtensionTelemetry,
    ErrorConfiguration,
    ExtensionConfigurationWorker,
    formatIssueUrl,
    IDotnetAcquireContext,
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
}
namespace commandKeys {
    export const acquire = 'acquire';
    export const uninstallAll = 'uninstallAll';
    export const showAcquisitionLog = 'showAcquisitionLog';
    export const reportIssue = 'reportIssue';
}
const commandPrefix = 'dotnet-sdk';
const configPrefix = 'dotnetSDKAcquisitionExtension';
const displayChannelName = '.NET SDK';
const defaultTimeoutValue = 240;

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
        showLogCommand: `${commandPrefix}.${commandKeys.showAcquisitionLog}`,
    } as IEventStreamContext;
    const [eventStream, outputChannel, loggingObserver, eventStreamObservers] = registerEventStream(eventStreamContext);

    const displayWorker = extensionContext ? extensionContext.displayWorker : new WindowDisplayWorker();
    const extensionConfigWorker = new ExtensionConfigurationWorker(extensionConfiguration, undefined);
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
    let storagePath: string;
    if (os.platform() === 'win32') {
        // Install to %AppData% on windows to avoid running into long path errors
        storagePath = process.env.APPDATA ? process.env.APPDATA : context.globalStoragePath;
    } else {
        storagePath = context.globalStoragePath;
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath);
        }
    }

    const acquisitionWorker = new DotnetCoreAcquisitionWorker({
        storagePath,
        extensionState: context.globalState,
        eventStream,
        acquisitionInvoker: new AcquisitionInvoker(context.globalState, eventStream),
        installationValidator: new InstallationValidator(eventStream),
        timeoutValue: timeoutValue === undefined ? defaultTimeoutValue : timeoutValue,
    });
    const versionResolver = new VersionResolver(context.globalState, eventStream);

    const dotnetAcquireRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquire}`, async (commandContext: IDotnetAcquireContext) => {
        const pathResult = callWithErrorHandling(async () => {
            eventStream.post(new DotnetSDKAcquisitionStarted());

            let version: string | undefined = commandContext ? commandContext.version : undefined;
            if (!version) {
                version = await vscode.window.showInputBox({
                    placeHolder: '5.0',
                    value: '5.0',
                    prompt: '.NET version, i.e. 5.0',
                });
            }
            if (!version) {
                displayWorker.showErrorMessage('No .NET SDK version provided', () => { /* No callback needed */ });
                return undefined;
            }

            eventStream.post(new DotnetAcquisitionRequested(version!));
            const resolvedVersion = await versionResolver.getFullSDKVersion(version!);
            const dotnetPath = await acquisitionWorker.acquireSDK(resolvedVersion);
            displayWorker.showInformationMessage(`.NET SDK ${version} installed to ${dotnetPath.dotnetPath}`, () => { /* No callback needed */ });
            // TODO add to PATH?
            return dotnetPath;
        }, issueContext(undefined, 'acquireSDK'));
        return pathResult;
    });
    const dotnetUninstallAllRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.uninstallAll}`, async (commandContext: IDotnetUninstallContext | undefined) => {
        await callWithErrorHandling(async () => {
            await acquisitionWorker.uninstallAll();
            displayWorker.showInformationMessage('All VS Code copies of the .NET SDK uninstalled.', () => { /* No callback needed */ });
        }, issueContext(commandContext ? commandContext.errorConfiguration : undefined, 'uninstallAll'));
    });
    const showOutputChannelRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.showAcquisitionLog}`, () => outputChannel.show(/* preserveFocus */ false));
    const reportIssueRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.reportIssue}`, async () => {
        const [url, issueBody] = formatIssueUrl(undefined, issueContext(AcquireErrorConfiguration.DisableErrorPopups, 'reportIssue'));
        await vscode.env.clipboard.writeText(issueBody);
        open(url);
    });

    context.subscriptions.push(
        dotnetAcquireRegistration,
        dotnetUninstallAllRegistration,
        showOutputChannelRegistration,
        reportIssueRegistration);
    context.subscriptions.push({
        dispose: () => vscode.Disposable.from(...eventStreamObservers).dispose(),
    });
}
