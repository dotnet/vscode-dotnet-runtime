/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

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
    DotnetAcquisitionStatusRequested,
    DotnetCoreAcquisitionWorker,
    DotnetCoreDependencyInstaller,
    DotnetExistingPathResolutionCompleted,
    DotnetRuntimeAcquisitionStarted,
    DotnetRuntimeAcquisitionTotalSuccessEvent,
    enableExtensionTelemetry,
    ErrorConfiguration,
    ExistingPathResolver,
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
    RuntimeInstallationDirectoryProvider,
    VersionResolver,
    VSCodeExtensionContext,
    VSCodeEnvironment,
    WindowDisplayWorker,
    DotnetSDKAcquisitionStarted,
    GlobalInstallerResolver,
    SdkInstallationDirectoryProvider,
    CommandExecutor,
} from 'vscode-dotnet-runtime-library';
import { dotnetCoreAcquisitionExtensionId } from './DotnetCoreAcquisitionId';

// tslint:disable no-var-requires
const packageJson = require('../package.json');

// Extension constants
namespace configKeys {
    export const installTimeoutValue = 'installTimeoutValue';
    export const enableTelemetry = 'enableTelemetry';
    export const existingPath = 'existingDotnetPath';
    export const proxyUrl = 'proxyUrl';
}
namespace commandKeys {
    export const acquire = 'acquire';
    export const acquireGlobalSDK = 'acquireGlobalSDK';
    export const acquireStatus = 'acquireStatus';
    export const uninstallAll = 'uninstallAll';
    export const showAcquisitionLog = 'showAcquisitionLog';
    export const ensureDotnetDependencies = 'ensureDotnetDependencies';
    export const reportIssue = 'reportIssue';
}

const commandPrefix = 'dotnet';
const configPrefix = 'dotnetAcquisitionExtension';
const displayChannelName = '.NET Runtime';
const defaultTimeoutValue = 600;
const moreInfoUrl = 'https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md';

export function activate(context: vscode.ExtensionContext, extensionContext?: IExtensionContext)
{
    // Loading Extension Configuration
    const extensionConfiguration = extensionContext !== undefined && extensionContext.extensionConfiguration ?
    extensionContext.extensionConfiguration :
    vscode.workspace.getConfiguration(configPrefix);

    // Reading Extension Configuration
    const timeoutValue = extensionConfiguration.get<number>(configKeys.installTimeoutValue);
    if (!fs.existsSync(context.globalStoragePath)) {
        fs.mkdirSync(context.globalStoragePath);
    }
    const resolvedTimeoutSeconds = timeoutValue === undefined ? defaultTimeoutValue : timeoutValue;
    const proxyLink = extensionConfiguration.get<string>(configKeys.proxyUrl);
    const isExtensionTelemetryEnabled = enableExtensionTelemetry(extensionConfiguration, configKeys.enableTelemetry);
    const displayWorker = extensionContext ? extensionContext.displayWorker : new WindowDisplayWorker();

    // Creating Contexts to Execute Under
    const utilContext = {
        ui : displayWorker,
        vsCodeEnv: new VSCodeEnvironment()
    }

    const vsCodeExtensionContext = new VSCodeExtensionContext(context);
    const eventStreamContext = {
        displayChannelName,
        logPath: context.logPath,
        extensionId: dotnetCoreAcquisitionExtensionId,
        enableTelemetry: isExtensionTelemetryEnabled,
        telemetryReporter: extensionContext ? extensionContext.telemetryReporter : undefined,
        showLogCommand: `${commandPrefix}.${commandKeys.showAcquisitionLog}`,
        packageJson
    } as IEventStreamContext;
    const [eventStream, outputChannel, loggingObserver, eventStreamObservers] = registerEventStream(eventStreamContext, vsCodeExtensionContext, utilContext);

    const versionResolver = new VersionResolver(context.globalState, eventStream, resolvedTimeoutSeconds, proxyLink);

    // Setting up command-shared classes for Runtime & SDK Acquisition
    const existingPathConfigWorker = new ExtensionConfigurationWorker(extensionConfiguration, configKeys.existingPath);
    const runtimeIssueContextFunctor = getIssueContext(existingPathConfigWorker);
    const runtimeAcquisitionWorker = getAcquisitonWorker(true);

    const sdkIssueContextFunctor = getIssueContext(existingPathConfigWorker);
    const sdkAcquisitionWorker = getAcquisitonWorker(false);

    // Creating API Surfaces
    const dotnetAcquireRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquire}`, async (commandContext: IDotnetAcquireContext) => {
        let fullyResolvedVersion = '';
        const dotnetPath = await callWithErrorHandling<Promise<IDotnetAcquireResult>>(async () => {
            eventStream.post(new DotnetRuntimeAcquisitionStarted(commandContext.requestingExtensionId));
            eventStream.post(new DotnetAcquisitionRequested(commandContext.version, commandContext.requestingExtensionId));

            runtimeAcquisitionWorker.setAcquisitionContext(commandContext);

            if (!commandContext.version || commandContext.version === 'latest') {
                throw new Error(`Cannot acquire .NET version "${commandContext.version}". Please provide a valid version.`);
            }

            const existingPath = await resolveExistingPathIfExists(existingPathConfigWorker, commandContext);
            if(existingPath)
            {
                return existingPath;
            }

            const version = await versionResolver.getFullRuntimeVersion(commandContext.version);
            fullyResolvedVersion = version;

            if(commandContext.architecture !== undefined)
            {
                runtimeAcquisitionWorker.installingArchitecture = commandContext.architecture;
            }
            return runtimeAcquisitionWorker.acquireRuntime(version);
        }, runtimeIssueContextFunctor(commandContext.errorConfiguration, 'acquire', commandContext.version), commandContext.requestingExtensionId);

        const installKey = runtimeAcquisitionWorker.getInstallKey(fullyResolvedVersion);
        eventStream.post(new DotnetRuntimeAcquisitionTotalSuccessEvent(commandContext.version, installKey, commandContext.requestingExtensionId ?? '', dotnetPath?.dotnetPath ?? ''));
        return dotnetPath;
    });

    const dotnetAcquireGlobalSDKRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquireGlobalSDK}`, async (commandContext: IDotnetAcquireContext) =>
    {
        if (commandContext.requestingExtensionId === undefined)
        {
            return Promise.reject('No requesting extension id was provided.');
        }

        const pathResult = callWithErrorHandling(async () =>
        {
            eventStream.post(new DotnetSDKAcquisitionStarted(commandContext.requestingExtensionId));
            eventStream.post(new DotnetAcquisitionRequested(commandContext.version, commandContext.requestingExtensionId));

            const existingPath = await resolveExistingPathIfExists(existingPathConfigWorker, commandContext);
            if(existingPath)
            {
                return Promise.resolve(existingPath);
            }

            sdkAcquisitionWorker.setAcquisitionContext(commandContext);

            if(commandContext.version === '' || !commandContext.version)
            {
                throw Error(`No version was defined to install.`);
            }

            const globalInstallerResolver = new GlobalInstallerResolver(context.globalState, eventStream, commandContext.version, resolvedTimeoutSeconds, proxyLink);
            const dotnetPath = await sdkAcquisitionWorker.acquireGlobalSDK(globalInstallerResolver);

            new CommandExecutor(eventStream, utilContext).setPathEnvVar(dotnetPath.dotnetPath, moreInfoUrl, displayWorker, vsCodeExtensionContext, true);
            return dotnetPath;
        }, sdkIssueContextFunctor(commandContext.errorConfiguration, commandKeys.acquireGlobalSDK));

        return pathResult;
    });

    const dotnetAcquireStatusRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquireStatus}`, async (commandContext: IDotnetAcquireContext) => {
        const pathResult = callWithErrorHandling(async () => {
            eventStream.post(new DotnetAcquisitionStatusRequested(commandContext.version, commandContext.requestingExtensionId));
            const resolvedVersion = await versionResolver.getFullRuntimeVersion(commandContext.version);
            const dotnetPath = await runtimeAcquisitionWorker.acquireStatus(resolvedVersion, true);
            return dotnetPath;
        }, runtimeIssueContextFunctor(commandContext.errorConfiguration, 'acquireRuntimeStatus'));
        return pathResult;
    });

    const dotnetUninstallAllRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.uninstallAll}`, async (commandContext: IDotnetUninstallContext | undefined) => {
        await callWithErrorHandling(() => runtimeAcquisitionWorker.uninstallAll(), runtimeIssueContextFunctor(commandContext ? commandContext.errorConfiguration : undefined, 'uninstallAll'));
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
            if (installer.signalIndicatesMissingLinuxDependencies(result.signal!)) {
                eventStream.post(new DotnetAcquisitionMissingLinuxDependencies());
                await installer.promptLinuxDependencyInstall('Failed to run .NET runtime.');
            }
        }, runtimeIssueContextFunctor(commandContext.errorConfiguration, 'ensureDependencies'));
    });

    const reportIssueRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.reportIssue}`, async () => {
        const [url, issueBody] = formatIssueUrl(undefined, runtimeIssueContextFunctor(AcquireErrorConfiguration.DisableErrorPopups, 'reportIssue'));
        await vscode.env.clipboard.writeText(issueBody);
        open(url);
    });

    // Helper Functions
    function resolveExistingPathIfExists(configResolver : ExtensionConfigurationWorker, commandContext : IDotnetAcquireContext) : Promise<IDotnetAcquireResult | null>
    {
        const existingPathResolver = new ExistingPathResolver();

        const existingPath = existingPathResolver.resolveExistingPath(configResolver.getPathConfigurationValue(), commandContext.requestingExtensionId, displayWorker);
        if (existingPath) {
            eventStream.post(new DotnetExistingPathResolutionCompleted(existingPath.dotnetPath));
            return new Promise((resolve) => {
                resolve(existingPath);
            });
        }
        return new Promise((resolve) => {
            resolve(null);
        });
    }

    function getAcquisitonWorker(isRuntimeWorker : boolean) : DotnetCoreAcquisitionWorker
    {
        return new DotnetCoreAcquisitionWorker({
            storagePath: context.globalStoragePath,
            extensionState: context.globalState,
            eventStream,
            acquisitionInvoker: new AcquisitionInvoker(context.globalState, eventStream, resolvedTimeoutSeconds, utilContext),
            installationValidator: new InstallationValidator(eventStream),
            timeoutValue: resolvedTimeoutSeconds,
            installDirectoryProvider: isRuntimeWorker ? new RuntimeInstallationDirectoryProvider(context.globalStoragePath): new SdkInstallationDirectoryProvider(context.globalStoragePath),
            proxyUrl: proxyLink,
            isExtensionTelemetryInitiallyEnabled: isExtensionTelemetryEnabled
        }, utilContext, vsCodeExtensionContext);
    }

    function getIssueContext(configResolver : ExtensionConfigurationWorker)
    {
        return (errorConfiguration: ErrorConfiguration | undefined, commandName: string, version?: string) => {
            return {
                logger: loggingObserver,
                errorConfiguration: errorConfiguration || AcquireErrorConfiguration.DisplayAllErrorPopups,
                displayWorker,
                extensionConfigWorker: configResolver,
                eventStream,
                commandName,
                version,
                moreInfoUrl,
                timeoutInfoUrl: `${moreInfoUrl}#install-script-timeouts`
            } as IIssueContext;
        };
    }

    // Exposing API Endpoints
    context.subscriptions.push(
        dotnetAcquireRegistration,
        dotnetAcquireStatusRegistration,
        dotnetAcquireGlobalSDKRegistration,
        dotnetUninstallAllRegistration,
        showOutputChannelRegistration,
        ensureDependenciesRegistration,
        reportIssueRegistration,
        ...eventStreamObservers);

}
