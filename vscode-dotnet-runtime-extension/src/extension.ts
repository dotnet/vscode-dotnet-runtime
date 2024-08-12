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
    enableExtensionTelemetry,
    EventBasedError,
    ErrorConfiguration,
    ExistingPathResolver,
    ExtensionConfigurationWorker,
    formatIssueUrl,
    IDotnetAcquireContext,
    IAcquisitionWorkerContext,
    NoExtensionIdProvided,
    IDotnetAcquireResult,
    IDotnetEnsureDependenciesContext,
    IDotnetUninstallContext,
    IEventStreamContext,
    IExtensionContext,
    IIssueContext,
    InstallationValidator,
    registerEventStream,
    directoryProviderFactory,
    VersionResolver,
    VSCodeExtensionContext,
    VSCodeEnvironment,
    WindowDisplayWorker,
    GlobalInstallerResolver,
    CommandExecutor,
    IDotnetListVersionsContext,
    WebRequestWorker,
    IDotnetVersion,
    DotnetInstallMode,
    DotnetVersionResolutionError,
    IDotnetListVersionsResult,
    LinuxVersionResolver,
    GlobalAcquisitionContextMenuOpened,
    UserManualInstallVersionChosen,
    UserManualInstallRequested,
    UserManualInstallSuccess,
    InvalidUninstallRequest,
    UserManualInstallFailure,
    DotnetInstall,
    EventCancellationError,
    getInstallIdCustomArchitecture,
    DotnetInstallType,
    DotnetAcquisitionTotalSuccessEvent,
    isRunningUnderWSL,
    InstallRecord
} from 'vscode-dotnet-runtime-library';
import { dotnetCoreAcquisitionExtensionId } from './DotnetCoreAcquisitionId';
import { InstallTrackerSingleton } from 'vscode-dotnet-runtime-library/dist/Acquisition/InstallTrackerSingleton';

// tslint:disable no-var-requires
const packageJson = require('../package.json');

// Extension constants
namespace configKeys {
    export const installTimeoutValue = 'installTimeoutValue';
    export const enableTelemetry = 'enableTelemetry';
    export const existingPath = 'existingDotnetPath';
    export const existingSharedPath = 'sharedExistingDotnetPath'
    export const proxyUrl = 'proxyUrl';
}

namespace commandKeys {
    export const acquire = 'acquire';
    export const acquireGlobalSDK = 'acquireGlobalSDK';
    export const acquireStatus = 'acquireStatus';
    export const uninstall = 'uninstall';
    export const uninstallPublic = 'uninstallPublic'
    export const uninstallAll = 'uninstallAll';
    export const listVersions = 'listVersions';
    export const recommendedVersion = 'recommendedVersion'
    export const globalAcquireSDKPublic = 'acquireGlobalSDKPublic';
    export const showAcquisitionLog = 'showAcquisitionLog';
    export const ensureDotnetDependencies = 'ensureDotnetDependencies';
    export const reportIssue = 'reportIssue';
}

const commandPrefix = 'dotnet';
const configPrefix = 'dotnetAcquisitionExtension';
const displayChannelName = '.NET Install Tool';
const defaultTimeoutValue = 600;
const moreInfoUrl = 'https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md';
let disableActivationUnderTest = true;

export function activate(vsCodeContext: vscode.ExtensionContext, extensionContext?: IExtensionContext)
{

    if((process.env.DOTNET_INSTALL_TOOL_UNDER_TEST === 'true' || (vsCodeContext?.extensionMode === vscode.ExtensionMode.Test)) && disableActivationUnderTest)
    {
        return;
    }

    // Loading Extension Configuration
    const extensionConfiguration = extensionContext !== undefined && extensionContext.extensionConfiguration ?
    extensionContext.extensionConfiguration :
    vscode.workspace.getConfiguration(configPrefix);

    // Reading Extension Configuration
    const timeoutValue = extensionConfiguration.get<number>(configKeys.installTimeoutValue);
    if (!fs.existsSync(vsCodeContext.globalStoragePath)) {
        fs.mkdirSync(vsCodeContext.globalStoragePath);
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

    const vsCodeExtensionContext = new VSCodeExtensionContext(vsCodeContext);
    const eventStreamContext = {
        displayChannelName,
        logPath: vsCodeContext.logPath,
        extensionId: dotnetCoreAcquisitionExtensionId,
        enableTelemetry: isExtensionTelemetryEnabled,
        telemetryReporter: extensionContext ? extensionContext.telemetryReporter : undefined,
        showLogCommand: `${commandPrefix}.${commandKeys.showAcquisitionLog}`,
        packageJson
    } as IEventStreamContext;
    const [globalEventStream, outputChannel, loggingObserver,
        eventStreamObservers, telemetryObserver, _] = registerEventStream(eventStreamContext, vsCodeExtensionContext, utilContext);


    // Setting up command-shared classes for Runtime & SDK Acquisition
    const existingPathConfigWorker = new ExtensionConfigurationWorker(extensionConfiguration, configKeys.existingPath, configKeys.existingSharedPath);
    checkIfSDKAcquisitionIsSupported();

    // Creating API Surfaces
    const dotnetAcquireRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquire}`, async (commandContext: IDotnetAcquireContext) =>
    {
        const worker = getAcquisitionWorker();
        commandContext.mode = commandContext.mode ?? 'runtime' as DotnetInstallMode;
        const mode = commandContext.mode;

        const runtimeContext = getAcquisitionWorkerContext(mode, commandContext);

        const dotnetPath = await callWithErrorHandling<Promise<IDotnetAcquireResult>>(async () =>
        {
            globalEventStream.post(new DotnetAcquisitionRequested(commandContext.version, commandContext.requestingExtensionId ?? 'notProvided', mode, commandContext.installType ?? 'local'));

            telemetryObserver?.setAcquisitionContext(runtimeContext, commandContext);

            if(!commandContext.requestingExtensionId)
            {
                globalEventStream.post(new NoExtensionIdProvided(`No requesting extension id was provided for the request ${commandContext.version}.`));
                vscode.window.showWarningMessage(`One of your extensions is attempting to install .NET without providing an extension id.
                This install cannot be properly maintained. Please report this to the extension author.`);
            }

            if (!commandContext.version || commandContext.version === 'latest') {
                throw new EventBasedError('BadContextualVersion',
                    `Cannot acquire .NET version "${commandContext.version}". Please provide a valid version.`);
            }

            const existingPath = await resolveExistingPathIfExists(existingPathConfigWorker, commandContext);
            if(existingPath)
            {
                return existingPath;
            }

            // Note: This will impact the context object given to the worker and error handler since objects own a copy of a reference in JS.
            const runtimeVersionResolver = new VersionResolver(runtimeContext);
            commandContext.version = await runtimeVersionResolver.getFullVersion(commandContext.version, mode);

            const acquisitionInvoker = new AcquisitionInvoker(runtimeContext, utilContext);
            return mode === 'aspnetcore' ? worker.acquireLocalASPNET(runtimeContext, acquisitionInvoker) : worker.acquireLocalRuntime(runtimeContext, acquisitionInvoker);
        }, getIssueContext(existingPathConfigWorker)(commandContext.errorConfiguration, 'acquire', commandContext.version), commandContext.requestingExtensionId, runtimeContext);

        const installationId = getInstallIdCustomArchitecture(commandContext.version, commandContext.architecture, mode, 'local');
        const install = {installId : installationId, version : commandContext.version, installMode: mode, isGlobal: false,
            architecture: commandContext.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture()} as DotnetInstall;

        if(dotnetPath !== undefined && dotnetPath?.dotnetPath)
        {
            globalEventStream.post(new DotnetAcquisitionTotalSuccessEvent(commandContext.version, install, commandContext.requestingExtensionId ?? '', dotnetPath.dotnetPath));
        }

        loggingObserver.dispose();
        return dotnetPath;
    });

    const dotnetAcquireGlobalSDKRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquireGlobalSDK}`, async (commandContext: IDotnetAcquireContext) =>
    {
        commandContext.mode = commandContext.mode ?? 'sdk' as DotnetInstallMode;

        if (commandContext.requestingExtensionId === undefined)
        {
            return Promise.reject('No requesting extension id was provided.');
        }

        let fullyResolvedVersion = '';
        const sdkContext = getAcquisitionWorkerContext(commandContext.mode, commandContext);
        const worker = getAcquisitionWorker();

        const pathResult = await callWithErrorHandling(async () =>
        {
            // Warning: Between now and later in this call-stack, the context 'version' is incomplete as it has not been resolved.
            // Errors between here and the place where it is resolved cannot be routed to one another.

            telemetryObserver?.setAcquisitionContext(sdkContext, commandContext);

            if(commandContext.version === '' || !commandContext.version)
            {
                    throw new EventCancellationError('BadContextualRuntimeVersionError',
                    `No version was defined to install.`);
            }

            globalEventStream.post(new DotnetAcquisitionRequested(commandContext.version, commandContext.requestingExtensionId ?? 'notProvided', commandContext.mode!, commandContext.installType ?? 'global'));

            const existingPath = await resolveExistingPathIfExists(existingPathConfigWorker, commandContext);
            if(existingPath)
            {
                return Promise.resolve(existingPath);
            }

            const globalInstallerResolver = new GlobalInstallerResolver(sdkContext, commandContext.version);
            fullyResolvedVersion = await globalInstallerResolver.getFullySpecifiedVersion();

            // Reset context to point to the fully specified version so it is not possible for someone to access incorrect data during the install process.
            // Note: This will impact the context object given to the worker and error handler since objects own a copy of a reference in JS.
            commandContext.version = fullyResolvedVersion;
            telemetryObserver?.setAcquisitionContext(sdkContext, commandContext);

            outputChannel.show(true);
            const dotnetPath = await worker.acquireGlobalSDK(sdkContext, globalInstallerResolver);

            new CommandExecutor(sdkContext, utilContext).setPathEnvVar(dotnetPath.dotnetPath, moreInfoUrl, displayWorker, vsCodeExtensionContext, true);
            return dotnetPath;
        }, getIssueContext(existingPathConfigWorker)(commandContext.errorConfiguration, commandKeys.acquireGlobalSDK), commandContext.requestingExtensionId, sdkContext);

        const installationId = getInstallIdCustomArchitecture(commandContext.version, commandContext.architecture, commandContext.mode, 'global');
        const install = {installId : installationId, version : commandContext.version, installMode: commandContext.mode, isGlobal: true,
            architecture: commandContext.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture()} as DotnetInstall;

        if(pathResult !== undefined && pathResult?.dotnetPath)
        {
            globalEventStream.post(new DotnetAcquisitionTotalSuccessEvent(commandContext.version, install, commandContext.requestingExtensionId ?? '', pathResult.dotnetPath));
        }

        loggingObserver.dispose();
        return pathResult;
    });

    const dotnetListVersionsRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.listVersions}`,
    async (commandContext: IDotnetListVersionsContext | undefined, customWebWorker: WebRequestWorker | undefined) =>
    {
        return getAvailableVersions(commandContext, customWebWorker, false);
    });

    const dotnetRecommendedVersionRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.recommendedVersion}`,
    async (commandContext: IDotnetListVersionsContext | undefined, customWebWorker: WebRequestWorker | undefined) : Promise<IDotnetListVersionsResult> =>
    {
        const availableVersions = await getAvailableVersions(commandContext, customWebWorker, true);
        const activeSupportVersions = availableVersions?.filter( (version : IDotnetVersion) => version.supportPhase === 'active');

        if (!activeSupportVersions || activeSupportVersions.length < 1)
        {
            const err = new EventCancellationError('DotnetVersionResolutionError', `An active-support version of dotnet couldn't be found. Discovered versions: ${JSON.stringify(availableVersions)}`);
            globalEventStream.post(new DotnetVersionResolutionError(err, null));
            if(!availableVersions || availableVersions.length < 1)
            {
                return [];
            }
            return [availableVersions[0]];
        }

        // The first item will be the newest version.
        return [activeSupportVersions[0]];
    });

    const acquireGlobalSDKPublicRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.globalAcquireSDKPublic}`, async (commandContext: IDotnetAcquireContext) =>
    {
        globalEventStream.post(new GlobalAcquisitionContextMenuOpened(`The user has opened the global SDK acquisition context menu.`));

        const recommendedVersionResult : IDotnetListVersionsResult = await vscode.commands.executeCommand('dotnet.recommendedVersion');
        const recommendedVersion : string = recommendedVersionResult ? recommendedVersionResult[0].version : '';

        const chosenVersion = await vscode.window.showInputBox(
        {
                placeHolder: recommendedVersion,
                value: recommendedVersion,
                prompt: 'The .NET SDK version. You can use different formats: 5, 3.1, 7.0.3xx, 6.0.201, etc.',
        }) ?? '';

        globalEventStream.post(new UserManualInstallVersionChosen(`The user has chosen to install the .NET SDK version ${chosenVersion}.`));

        try
        {
            globalEventStream.post(new UserManualInstallRequested(`Starting to install the .NET SDK ${chosenVersion} via a user request.`));

            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
            const userCommandContext : IDotnetAcquireContext = { version: chosenVersion, requestingExtensionId: 'user', installType: 'global' };
            const path : IDotnetAcquireResult = await vscode.commands.executeCommand('dotnet.acquireGlobalSDK', userCommandContext);
            if(path && path?.dotnetPath)
            {
                globalEventStream.post(new UserManualInstallSuccess(`The .NET SDK ${chosenVersion} was successfully installed.`));
            }
        }
        catch (error)
        {
            globalEventStream.post(new UserManualInstallFailure((error as Error), `The .NET SDK ${chosenVersion} failed to install. Error: ${(error as Error).toString()}`));
            vscode.window.showErrorMessage((error as Error).toString());
        }
    });

    const dotnetAcquireStatusRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquireStatus}`, async (commandContext: IDotnetAcquireContext) => {
        const pathResult = callWithErrorHandling(async () =>
        {
            const mode = commandContext.mode ?? 'runtime' as DotnetInstallMode;
            const worker = getAcquisitionWorker();
            const workerContext = getAcquisitionWorkerContext(mode, commandContext);

            globalEventStream.post(new DotnetAcquisitionStatusRequested(commandContext.version, commandContext.requestingExtensionId));
            const runtimeVersionResolver = new VersionResolver(workerContext);
            const resolvedVersion = await runtimeVersionResolver.getFullVersion(commandContext.version, mode);
            commandContext.version = resolvedVersion;
            const dotnetPath = await worker.acquireStatus(workerContext, mode);
            return dotnetPath;
        }, getIssueContext(existingPathConfigWorker)(commandContext.errorConfiguration, 'acquireStatus'));
        return pathResult;
    });

    const dotnetUninstallPublicRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.uninstallPublic}`, async () =>
    {
        const existingInstalls = await InstallTrackerSingleton.getInstance(globalEventStream, vsCodeContext.globalState).getExistingInstalls(true);

        const menuItems = existingInstalls.sort(
        function(x : InstallRecord, y : InstallRecord) : number
        {
            if(x.dotnetInstall.installMode === y.dotnetInstall.installMode)
            {
                return x.dotnetInstall.version.localeCompare(y.dotnetInstall.version);
            }
            return x.dotnetInstall.installMode.localeCompare(y.dotnetInstall.installMode);
        }).map(install =>
        {
            return {
                label : `.NET ${(install.dotnetInstall.installMode).toUpperCase()} ${install.dotnetInstall.version}`,
                description : `${install.dotnetInstall.architecture ?? ''} | ${install.dotnetInstall.isGlobal ? 'machine-wide' : 'vscode-local' }`,
                detail : `Used by ${install.installingExtensions.join(', ')}`,
                iconPath : install.dotnetInstall.isGlobal ? new vscode.ThemeIcon('shield') : new vscode.ThemeIcon('trash'),
                internalId : install.dotnetInstall.installId
            }
        });
        const chosenVersion = await vscode.window.showQuickPick(menuItems, { placeHolder: 'Select a version to uninstall.' });

        if(chosenVersion)
        {
            const installRecord : InstallRecord = existingInstalls.find(install => install.dotnetInstall.installId === chosenVersion.internalId)!;
            const install : DotnetInstall = installRecord.dotnetInstall;
            let canContinue = true;
            const uninstallWillBreakSomething = !(await InstallTrackerSingleton.getInstance(globalEventStream, vsCodeContext.globalState).canUninstall(true, install, true));

            const yes = `Continue`;
            if(uninstallWillBreakSomething)
            {
                const pick = await vscode.window.showWarningMessage(
`Uninstalling .NET ${install.version} will likely cause ${installRecord.installingExtensions.join(', ')} to stop functioning properly. Do you still wish to continue?`, { modal: true }, yes);
                canContinue = pick === yes;
            }

            if(!canContinue)
            {
                return;
            }

            const commandContext : IDotnetAcquireContext =
            {
                version: install.version,
                mode: install.installMode,
                installType: install.isGlobal ? 'global' : 'local',
                architecture: install.architecture,
                requestingExtensionId : 'user'
            }

            outputChannel.show(true);
            return uninstall(commandContext, true);
        }
    });

    /**
     * @returns 0 on success. Error string if not.
     */
    const dotnetUninstallRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.uninstall}`, async (commandContext: IDotnetAcquireContext | undefined) =>
    {
        return uninstall(commandContext);
    });

    async function uninstall(commandContext: IDotnetAcquireContext | undefined, force = false) : Promise<string>
    {
        let result = '1';
        await callWithErrorHandling(async () =>
        {
                if(!commandContext?.version || !commandContext?.installType || !commandContext?.mode || !commandContext?.requestingExtensionId)
                {
                    const error = new EventCancellationError('InvalidUninstallRequest', `The caller ${commandContext?.requestingExtensionId} did not properly submit an uninstall request.
    Please include the mode, installType, version, and extensionId.`);
                    globalEventStream.post(new InvalidUninstallRequest(error as Error));
                    throw error;
                }
                else
                {
                    const worker = getAcquisitionWorker();
                    const workerContext = getAcquisitionWorkerContext(commandContext.mode, commandContext);

                    if(commandContext.installType === 'local' && !force) // if using force mode, we are also using the UI, which passes the fully specified version to uninstall only
                    {
                        const versionResolver = new VersionResolver(workerContext);
                        const resolvedVersion = await versionResolver.getFullVersion(commandContext.version, commandContext.mode);
                        commandContext.version = resolvedVersion;
                    }

                    const installationId = getInstallIdCustomArchitecture(commandContext.version, commandContext.architecture, commandContext.mode, commandContext.installType);
                    const install = {installId : installationId, version : commandContext.version, installMode: commandContext.mode, isGlobal: commandContext.installType === 'global',
                        architecture: commandContext.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture()} as DotnetInstall;

                    if(commandContext.installType === 'local')
                    {
                        result = await worker.uninstallLocal(workerContext, install, force);
                    }
                    else
                    {
                        const globalInstallerResolver = new GlobalInstallerResolver(workerContext, commandContext.version);
                        result = await worker.uninstallGlobal(workerContext, install, globalInstallerResolver, force);
                    }
                }
        }, getIssueContext(existingPathConfigWorker)(commandContext?.errorConfiguration, 'uninstall'));

        return result;
    }

    const dotnetUninstallAllRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.uninstallAll}`, async (commandContext: IDotnetUninstallContext | undefined) => {
        await callWithErrorHandling(async () =>
        {
            const mode = 'runtime' as DotnetInstallMode;
            const worker = getAcquisitionWorker();
            const installDirectoryProvider = directoryProviderFactory(mode, vsCodeContext.globalStoragePath);

            await worker.uninstallAll(globalEventStream, installDirectoryProvider.getStoragePath(), vsCodeContext.globalState);
        },
            getIssueContext(existingPathConfigWorker)(commandContext ? commandContext.errorConfiguration : undefined, 'uninstallAll')
        );
    });

    const showOutputChannelRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.showAcquisitionLog}`, () => outputChannel.show(/* preserveFocus */ false));

    const ensureDependenciesRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.ensureDotnetDependencies}`, async (commandContext: IDotnetEnsureDependenciesContext) => {
        await callWithErrorHandling(async () =>
        {
            if (os.platform() !== 'linux') {
                // We can't handle installing dependencies for anything other than Linux
                return;
            }

            const result = cp.spawnSync(commandContext.command, commandContext.arguments);
            const installer = new DotnetCoreDependencyInstaller();
            if (installer.signalIndicatesMissingLinuxDependencies(result.signal!)) {
                globalEventStream.post(new DotnetAcquisitionMissingLinuxDependencies());
                await installer.promptLinuxDependencyInstall('Failed to run .NET runtime.');
            }
        }, getIssueContext(existingPathConfigWorker)(commandContext.errorConfiguration, 'ensureDependencies'));
    });

    const reportIssueRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.reportIssue}`, async () => {
        const [url, issueBody] = formatIssueUrl(undefined, getIssueContext(existingPathConfigWorker)(AcquireErrorConfiguration.DisableErrorPopups, 'reportIssue'));
        await vscode.env.clipboard.writeText(issueBody);
        open(url);
    });

    // Helper Functions
    function resolveExistingPathIfExists(configResolver : ExtensionConfigurationWorker, commandContext : IDotnetAcquireContext) : Promise<IDotnetAcquireResult | null>
    {
        const existingPathResolver = new ExistingPathResolver();

        const existingPath = existingPathResolver.resolveExistingPath(configResolver.getAllPathConfigurationValues(), commandContext.requestingExtensionId, displayWorker);
        if (existingPath) {
            globalEventStream.post(new DotnetExistingPathResolutionCompleted(existingPath.dotnetPath));
            return new Promise((resolve) => {
                resolve(existingPath);
            });
        }
        return new Promise((resolve) => {
            resolve(null);
        });
    }

    function checkIfSDKAcquisitionIsSupported() : boolean
    {
        let isSupported = true;
        isSupported = isSupported && !isRunningUnderWSL(globalEventStream);
        vscode.commands.executeCommand('setContext', 'dotnetAcquisitionExtension.isGlobalSDKUnsupported', !isSupported);
        return isSupported;
    }

    const getAvailableVersions = async (commandContext: IDotnetListVersionsContext | undefined,
        customWebWorker: WebRequestWorker | undefined, onRecommendationMode : boolean) : Promise<IDotnetListVersionsResult | undefined> =>
    {
        const mode = 'sdk' as DotnetInstallMode;
        const workercontext = getVersionResolverContext(mode, 'global', commandContext?.errorConfiguration);
        const customVersionResolver = new VersionResolver(workercontext, customWebWorker);

        if(os.platform() !== 'linux' || !onRecommendationMode)
        {
            const versionsResult = await callWithErrorHandling(async () =>
            {
                return customVersionResolver.GetAvailableDotnetVersions(commandContext);
            }, getIssueContext(existingPathConfigWorker)(commandContext?.errorConfiguration, 'getAvailableVersions'));

            return versionsResult;
        }
        else
        {
            const linuxResolver = new LinuxVersionResolver(workercontext, utilContext);
            try
            {
                const suggestedVersion = await linuxResolver.getRecommendedDotnetVersion('sdk' as DotnetInstallMode);
                const osAgnosticVersionData = await getAvailableVersions(commandContext, customWebWorker, !onRecommendationMode);
                const resolvedSupportPhase = osAgnosticVersionData?.find((version : IDotnetVersion) =>
                    customVersionResolver.getMajorMinor(version.version) === customVersionResolver.getMajorMinor(suggestedVersion))?.supportPhase ?? 'active';
                    // Assumption : The newest version is 'active' support, but we can't guarantee that.
                    // If the linux version is too old it will eventually support no active versions of .NET, which would cause a failure.
                    // The best we can give it is the newest working version, which is the most likely to be supported, and mark it as active so we can use it.

                return [
                    { version: suggestedVersion, channelVersion: `${customVersionResolver.getMajorMinor(suggestedVersion)}`,
                    supportStatus: Number(customVersionResolver.getMajor(suggestedVersion)) % 2 === 0 ? 'lts' : 'sts',
                    supportPhase: resolvedSupportPhase }
                ];
            }
            // tslint:disable no-any
            catch(error : any)
            {
                return [];
            }
            // tslint:enable no-any
        }
    }

    /**
     * @returns A 'worker' context object that can be used for when there actually isn't any acquisition happening.
     * Eventually the version resolver and web request worker should be decoupled from the context object, ...
     * so we don't need to do this, but not doing this right now.
     */
    function getVersionResolverContext(mode : DotnetInstallMode, typeOfInstall : DotnetInstallType, errorsConfiguration? : ErrorConfiguration) : IAcquisitionWorkerContext
    {
        return getAcquisitionWorkerContext(mode,
            {
                requestingExtensionId: 'notProvided',
                installType: typeOfInstall,
                version: 'notAnAcquisitionRequest',
                errorConfiguration: errorsConfiguration,
                architecture: DotnetCoreAcquisitionWorker.defaultArchitecture()
            } as IDotnetAcquireContext
        )
    }

    function getAcquisitionWorkerContext(mode : DotnetInstallMode, acquiringContext : IDotnetAcquireContext) : IAcquisitionWorkerContext
    {
        return {
            storagePath: vsCodeContext.globalStoragePath,
            extensionState: vsCodeContext.globalState,
            eventStream: globalEventStream,
            installationValidator: new InstallationValidator(globalEventStream),
            timeoutSeconds: resolvedTimeoutSeconds,
            acquisitionContext: acquiringContext,
            installDirectoryProvider: directoryProviderFactory(mode, vsCodeContext.globalStoragePath),
            proxyUrl: proxyLink,
            isExtensionTelemetryInitiallyEnabled: isExtensionTelemetryEnabled
        }
    }

    function getAcquisitionWorker() : DotnetCoreAcquisitionWorker
    {
        return new DotnetCoreAcquisitionWorker(utilContext, vsCodeExtensionContext);
    }

    function getIssueContext(configResolver : ExtensionConfigurationWorker)
    {
        return (errorConfiguration: ErrorConfiguration | undefined, commandName: string, version?: string) => {
            return {
                logger: loggingObserver,
                errorConfiguration: errorConfiguration || AcquireErrorConfiguration.DisplayAllErrorPopups,
                displayWorker,
                extensionConfigWorker: configResolver,
                eventStream: globalEventStream,
                commandName,
                version,
                moreInfoUrl,
                timeoutInfoUrl: `${moreInfoUrl}#install-script-timeouts`
            } as IIssueContext;
        };
    }

    // Exposing API Endpoints
    vsCodeContext.subscriptions.push(
        dotnetAcquireRegistration,
        dotnetAcquireStatusRegistration,
        dotnetAcquireGlobalSDKRegistration,
        acquireGlobalSDKPublicRegistration,
        dotnetListVersionsRegistration,
        dotnetRecommendedVersionRegistration,
        dotnetUninstallRegistration,
        dotnetUninstallPublicRegistration,
        dotnetUninstallAllRegistration,
        showOutputChannelRegistration,
        ensureDependenciesRegistration,
        reportIssueRegistration,
        ...eventStreamObservers);
}

export function ReEnableActivationForManualActivation()
{
    disableActivationUnderTest = false;
}
