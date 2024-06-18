/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import open = require('open');
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    AcquireErrorConfiguration,
    AcquisitionInvoker as LocalAcquisitionInvoker,
    callWithErrorHandling,
    DotnetAcquisitionRequested,
    DotnetAcquisitionStatusRequested,
    DotnetCoreAcquisitionWorker,
    DotnetSDKAcquisitionStarted,
    DotnetVersionResolutionError,
    enableExtensionTelemetry,
    ErrorConfiguration,
    ExtensionConfigurationWorker,
    formatIssueUrl,
    IDotnetAcquireContext,
    IDotnetListVersionsContext,
    IDotnetUninstallContext,
    EventBasedError,
    IDotnetVersion,
    IEventStreamContext,
    IExtensionContext,
    IIssueContext,
    InstallationValidator,
    registerEventStream,
    SdkInstallationDirectoryProvider,
    VersionResolver,
    VSCodeExtensionContext,
    VSCodeEnvironment,
    WebRequestWorker,
    IWindowDisplayWorker,
    WindowDisplayWorker,
    Debugging,
    CommandExecutor,
    directoryProviderFactory,
} from 'vscode-dotnet-runtime-library';

import { dotnetCoreAcquisitionExtensionId } from './DotnetCoreAcquisitionId';
import { GlobalInstallerResolver } from 'vscode-dotnet-runtime-library/dist/Acquisition/GlobalInstallerResolver';
import { IAcquisitionWorkerContext } from 'vscode-dotnet-runtime-library/dist/Acquisition/IAcquisitionWorkerContext';

// tslint:disable no-var-requires
const packageJson = require('../package.json');

// Extension constants
namespace configKeys {
    export const installTimeoutValue = 'installTimeoutValue';
    export const enableTelemetry = 'enableTelemetry';
    export const proxyUrl = 'proxyUrl';
}
namespace commandKeys {
    export const acquire = 'acquire';
    export const acquireStatus = 'acquireStatus';
    export const uninstallAll = 'uninstallAll';
    export const showAcquisitionLog = 'showAcquisitionLog';
    export const reportIssue = 'reportIssue';
}
const commandPrefix = 'dotnet-sdk';
const configPrefix = 'dotnetSDKAcquisitionExtension';
const displayChannelName = '.NET SDK';
const defaultTimeoutValue = 600;
const troubleshootingUrl = 'https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-sdk.md';
const knownExtensionIds = ['ms-dotnettools.sample-extension', 'ms-dotnettools.vscode-dotnet-pack'];

export function activate(context: vscode.ExtensionContext, extensionContext?: IExtensionContext) {
    const extensionConfiguration = extensionContext !== undefined && extensionContext.extensionConfiguration ?
        extensionContext.extensionConfiguration :
        vscode.workspace.getConfiguration(configPrefix);

    const displayWorker = extensionContext ? extensionContext.displayWorker : new WindowDisplayWorker();
    const utilContext =
    {
        ui: displayWorker,
        vsCodeEnv: new VSCodeEnvironment()
    }

    const vsCodeExtensionContext = new VSCodeExtensionContext(context);

    const isExtensionTelemetryEnabled = enableExtensionTelemetry(extensionConfiguration, configKeys.enableTelemetry);
    const eventStreamContext = {
        displayChannelName,
        logPath: context.logPath,
        extensionId: dotnetCoreAcquisitionExtensionId,
        enableTelemetry: isExtensionTelemetryEnabled,
        telemetryReporter: extensionContext ? extensionContext.telemetryReporter : undefined,
        showLogCommand: `${commandPrefix}.${commandKeys.showAcquisitionLog}`,
        packageJson,
    } as IEventStreamContext;
    const [eventStream, outputChannel, loggingObserver, eventStreamObservers, telemetryObserver] = registerEventStream(eventStreamContext, vsCodeExtensionContext, utilContext);

    const extensionConfigWorker = new ExtensionConfigurationWorker(extensionConfiguration, undefined, undefined);
    const issueContext = (errorConfiguration: ErrorConfiguration | undefined, commandName: string, version?: string) => {
        return {
            logger: loggingObserver,
            errorConfiguration: errorConfiguration || AcquireErrorConfiguration.DisplayAllErrorPopups,
            displayWorker,
            extensionConfigWorker,
            eventStream,
            commandName,
            version,
            timeoutInfoUrl: `${troubleshootingUrl}#install-script-timeouts`,
            moreInfoUrl: troubleshootingUrl,
        } as IIssueContext;
    };


    const timeoutValue = extensionConfiguration.get<number>(configKeys.installTimeoutValue);
    const resolvedTimeoutSeconds = timeoutValue === undefined ? defaultTimeoutValue : timeoutValue;

    let storagePath: string;
    if (os.platform() === 'win32') {
        // Install to %AppData% on windows to avoid running into long path errors
        storagePath = process.env.APPDATA ? process.env.APPDATA : context.globalStoragePath;
    } else {
        storagePath = path.join(os.homedir(), '.vscode-dotnet-sdk');
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath);
        }
    }


    const acquisitionWorker = new DotnetCoreAcquisitionWorker(utilContext, vsCodeExtensionContext);

    const dotnetAcquireRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquire}`, async (commandContext: IDotnetAcquireContext) =>
    {
        Debugging.log(`The SDK Extension Acquire Command was Invoked.`, eventStream);

        if (commandContext.requestingExtensionId === undefined)
        {
            return Promise.reject('No requesting extension id was provided.');
        }
        else if (!knownExtensionIds.includes(commandContext.requestingExtensionId!))
        {
            return Promise.reject(`${commandContext.requestingExtensionId} is not a known requesting extension id. The vscode-dotnet-sdk extension can only be used by ms-dotnettools.vscode-dotnet-pack.`);
        }

        const acquisitionContext = getContext(commandContext);
        const versionResolver = new VersionResolver(acquisitionContext);

        const pathResult = callWithErrorHandling(async () => {
            eventStream.post(new DotnetSDKAcquisitionStarted(commandContext.requestingExtensionId));

            eventStream.post(new DotnetAcquisitionRequested(commandContext.version, commandContext.requestingExtensionId ?? 'notProvided', 'sdk', 'local'));
            telemetryObserver?.setAcquisitionContext(acquisitionContext, commandContext);

            if(commandContext.installType === 'global')
            {
                Debugging.log(`Acquisition Request was remarked as Global.`, eventStream);

                if(commandContext.version === '' || !commandContext.version)
                {
                    throw new EventBasedError('BadContextualSDKExtensionVersionError',
                        `No version was defined to install.`);
                }

                const globalInstallerResolver = new GlobalInstallerResolver(acquisitionContext, commandContext.version);
                const dotnetPath = await acquisitionWorker.acquireGlobalSDK(acquisitionContext, globalInstallerResolver);

                new CommandExecutor(acquisitionContext, utilContext).setPathEnvVar(dotnetPath.dotnetPath, troubleshootingUrl, displayWorker, vsCodeExtensionContext, true);
                Debugging.log(`Returning path: ${dotnetPath}.`, eventStream);
                return dotnetPath;
            }
            else
            {
                Debugging.log(`Acquisition Request was remarked as local.`, eventStream);

                const resolvedVersion = await versionResolver.getFullSDKVersion(commandContext.version);
                acquisitionContext.acquisitionContext.version = resolvedVersion;
                const acquisitionInvoker = new LocalAcquisitionInvoker(acquisitionContext, utilContext);
                const dotnetPath = await acquisitionWorker.acquireSDK(acquisitionContext, acquisitionInvoker);

                const pathEnvVar = path.dirname(dotnetPath.dotnetPath);
                new CommandExecutor(acquisitionContext, utilContext).setPathEnvVar(pathEnvVar, troubleshootingUrl, displayWorker, vsCodeExtensionContext, false);
                return dotnetPath;
            }
        }, issueContext(commandContext.errorConfiguration, 'acquireSDK'), commandContext.requestingExtensionId, acquisitionContext);

        Debugging.log(`Returning Path Result ${pathResult}.`, eventStream);

        return pathResult;
    });

    const dotnetAcquireStatusRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquireStatus}`, async (commandContext: IDotnetAcquireContext) => {
        const pathResult = callWithErrorHandling(async () => {
            eventStream.post(new DotnetAcquisitionStatusRequested(commandContext.version, commandContext.requestingExtensionId));
            const fakeContext = getContext(null);
            const versionResolver = new VersionResolver(fakeContext);

            commandContext.version = await versionResolver.getFullSDKVersion(commandContext.version);
            const dotnetPath = await acquisitionWorker.acquireStatus(fakeContext, 'sdk');
            return dotnetPath;
        }, issueContext(commandContext.errorConfiguration, 'acquireSDKStatus'));
        return pathResult;
    });

    const dotnetUninstallAllRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.uninstallAll}`, async (commandContext: IDotnetUninstallContext | undefined) => {
        await callWithErrorHandling(async () => {
            await acquisitionWorker.uninstallAll(eventStream, directoryProviderFactory('sdk', storagePath).getStoragePath(), context.globalState);
        }, issueContext(commandContext ? commandContext.errorConfiguration : undefined, 'uninstallAll'));
    });

    const showOutputChannelRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.showAcquisitionLog}`, () => outputChannel.show(/* preserveFocus */ false));

    const reportIssueRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.reportIssue}`, async () => {
        const [url, issueBody] = formatIssueUrl(undefined, issueContext(AcquireErrorConfiguration.DisableErrorPopups, 'reportIssue'));
        await vscode.env.clipboard.writeText(issueBody);
        open(url);
    });

    function getContext(commandContext : IDotnetAcquireContext | null) : IAcquisitionWorkerContext
    {
        const acquisitionContext : IAcquisitionWorkerContext = {
            storagePath,
            extensionState: context.globalState,
            eventStream,
            installationValidator: new InstallationValidator(eventStream),
            installMode: 'sdk',
            timeoutSeconds: resolvedTimeoutSeconds,
            installDirectoryProvider: new SdkInstallationDirectoryProvider(storagePath),
            acquisitionContext : commandContext ?? { // See runtime extension for more details on this fake context.
                version: 'unspecified',
                architecture: os.arch(),
                requestingExtensionId: 'notAnAcquisitionCall',
            },
            isExtensionTelemetryInitiallyEnabled : isExtensionTelemetryEnabled,
        };

        return acquisitionContext;
    }

    context.subscriptions.push(
        dotnetAcquireRegistration,
        dotnetAcquireStatusRegistration,
        dotnetUninstallAllRegistration,
        showOutputChannelRegistration,
        reportIssueRegistration,
        ...eventStreamObservers);
}