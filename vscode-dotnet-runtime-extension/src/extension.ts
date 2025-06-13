/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import
{
    AcquireErrorConfiguration,
    AcquisitionInvoker,
    callWithErrorHandling,
    CommandExecutor,
    directoryProviderFactory,
    DotnetAcquisitionMissingLinuxDependencies,
    DotnetAcquisitionRequested,
    DotnetAcquisitionStatusRequested,
    DotnetAcquisitionTotalSuccessEvent,
    DotnetConditionValidator,
    DotnetCoreAcquisitionWorker,
    DotnetCoreDependencyInstaller,
    DotnetExistingPathResolutionCompleted,
    DotnetFindPathCommandInvoked,
    DotnetFindPathLookupSetting,
    DotnetFindPathMetCondition,
    DotnetFindPathNoPathMetCondition,
    DotnetFindPathSettingFound,
    DotnetInstall,
    DotnetInstallMode,
    DotnetInstallType,
    DotnetOfflineWarning,
    DotnetPathFinder,
    DotnetVersionCategorizedEvent,
    DotnetVersionResolutionError,
    DotnetVersionSpecRequirement,
    enableExtensionTelemetry,
    ErrorConfiguration,
    EventBasedError,
    EventCancellationError,
    ExistingPathResolver,
    ExtensionConfigurationWorker,
    formatIssueUrl,
    getInstallIdCustomArchitecture,
    getMajor,
    getMajorMinor,
    GlobalAcquisitionContextMenuOpened,
    GlobalInstallerResolver,
    IAcquisitionWorkerContext,
    IDotnetAcquireContext,
    IDotnetAcquireResult,
    IDotnetConditionValidator,
    IDotnetEnsureDependenciesContext,
    IDotnetFindPathContext,
    IDotnetListVersionsContext,
    IDotnetListVersionsResult,
    IDotnetUninstallContext,
    IDotnetVersion,
    IEventStreamContext,
    IExtensionContext,
    IIssueContext,
    InstallationValidator,
    InstallRecord,
    InvalidUninstallRequest,
    IUtilityContext,
    JsonInstaller,
    LinuxVersionResolver,
    LocalMemoryCacheSingleton,
    NoExtensionIdProvided,
    registerEventStream,
    UninstallErrorConfiguration,
    UserManualInstallFailure,
    UserManualInstallRequested,
    UserManualInstallSuccess,
    UserManualInstallVersionChosen,
    VersionResolver,
    VSCodeEnvironment,
    VSCodeExtensionContext,
    WebRequestWorkerSingleton,
    WindowDisplayWorker
} from 'vscode-dotnet-runtime-library';
import { InstallTrackerSingleton } from 'vscode-dotnet-runtime-library/dist/Acquisition/InstallTrackerSingleton';
import { dotnetCoreAcquisitionExtensionId } from './DotnetCoreAcquisitionId';
import open = require('open');

const packageJson = require('../package.json');

// Extension constants
namespace configKeys
{
    export const installTimeoutValue = 'installTimeoutValue';
    export const enableTelemetry = 'enableTelemetry';
    export const existingPath = 'existingDotnetPath';
    export const existingSharedPath = 'sharedExistingDotnetPath'
    export const proxyUrl = 'proxyUrl';
    export const allowInvalidPaths = 'allowInvalidPaths';
    export const cacheTimeToLiveMultiplier = 'cacheTimeToLiveMultiplier';
    export const showResetDataCommand = 'showResetDataCommand';
}

namespace commandKeys
{
    export const acquire = 'acquire';
    export const acquireGlobalSDK = 'acquireGlobalSDK';
    export const acquireStatus = 'acquireStatus';
    export const uninstall = 'uninstall';
    export const findPath = 'findPath';
    export const uninstallPublic = 'uninstallPublic'
    export const uninstallAll = 'uninstallAll';
    export const listVersions = 'listVersions';
    export const recommendedVersion = 'recommendedVersion'
    export const globalAcquireSDKPublic = 'acquireGlobalSDKPublic';
    export const showAcquisitionLog = 'showAcquisitionLog';
    export const ensureDotnetDependencies = 'ensureDotnetDependencies';
    export const reportIssue = 'reportIssue';
    export const resetData = 'resetData';
}

const commandPrefix = 'dotnet';
const configPrefix = 'dotnetAcquisitionExtension';
const displayChannelName = '.NET Install Tool';
const defaultTimeoutValue = 600;
const moreInfoUrl = 'https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/troubleshooting-runtime.md';
let disableActivationUnderTest = true;

export function activate(vsCodeContext: vscode.ExtensionContext, extensionContext?: IExtensionContext)
{

    if ((process.env.DOTNET_INSTALL_TOOL_UNDER_TEST === 'true' || (vsCodeContext?.extensionMode === vscode.ExtensionMode.Test)) && disableActivationUnderTest)
    {
        return;
    }

    // Loading Extension Configuration
    const extensionConfiguration = extensionContext !== undefined && extensionContext.extensionConfiguration ?
        extensionContext.extensionConfiguration :
        vscode.workspace.getConfiguration(configPrefix);

    // Reading Extension Configuration
    const timeoutValue = extensionConfiguration.get<number>(configKeys.installTimeoutValue);
    if (!fs.existsSync(vsCodeContext.globalStoragePath))
    {
        fs.mkdirSync(vsCodeContext.globalStoragePath, { recursive: true });
    }
    const resolvedTimeoutSeconds = timeoutValue === undefined ? defaultTimeoutValue : timeoutValue;
    const proxyLink = extensionConfiguration.get<string>(configKeys.proxyUrl);
    const showResetDataCommand = extensionConfiguration.get<boolean>(configKeys.showResetDataCommand);

    // Create a cache with the TTL setting that we can only reasonably access from here.
    const cacheTimeToLiveMultiplier = Math.abs(Number(extensionConfiguration.get<string>(configKeys.cacheTimeToLiveMultiplier) ?? 1)) ?? 1;
    const _localCache = LocalMemoryCacheSingleton.getInstance(cacheTimeToLiveMultiplier);


    const allowInvalidPathSetting = extensionConfiguration.get<boolean>(configKeys.allowInvalidPaths);
    const isExtensionTelemetryEnabled = enableExtensionTelemetry(extensionConfiguration, configKeys.enableTelemetry);
    const displayWorker = extensionContext ? extensionContext.displayWorker : new WindowDisplayWorker();

    // Creating Contexts to Execute Under
    const utilContext = {
        ui: displayWorker,
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

    // Creating API Surfaces
    const dotnetAcquireRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquire}`, async (commandContext: IDotnetAcquireContext): Promise<IDotnetAcquireResult | undefined> =>
    {
        const worker = getAcquisitionWorker();
        commandContext.mode = commandContext.mode ?? 'runtime' as DotnetInstallMode;
        const mode = commandContext.mode;

        const workerContext = getAcquisitionWorkerContext(mode, commandContext);

        const dotnetPath = await callWithErrorHandling<Promise<IDotnetAcquireResult>>(async () =>
        {
            globalEventStream.post(new DotnetAcquisitionRequested(commandContext.version, commandContext.requestingExtensionId ?? 'notProvided', mode, commandContext.installType ?? 'local'));

            telemetryObserver?.setAcquisitionContext(workerContext, commandContext);

            if (!commandContext.requestingExtensionId)
            {
                globalEventStream.post(new NoExtensionIdProvided(`No requesting extension id was provided for the request ${commandContext.version}.`));
                vscode.window.showWarningMessage(`One of your extensions is attempting to install .NET without providing an extension id.
                This install cannot be properly maintained. Please report this to the extension author.`);
            }

            if (!commandContext.version || commandContext.version === 'latest')
            {
                throw new EventBasedError('BadContextualVersion',
                    `Cannot acquire .NET version "${commandContext.version}". Please provide a valid version.`);
            }

            const existingPath = await resolveExistingPathIfExists(existingPathConfigWorker, commandContext, workerContext, utilContext);
            if (existingPath)
            {
                return existingPath;
            }

            const existingOfflinePath = await getExistingInstallIfOffline(worker, workerContext);
            if (existingOfflinePath)
            {
                return Promise.resolve(existingOfflinePath);
            }

            // Note: This will impact the context object given to the worker and error handler since objects own a copy of a reference in JS.
            const runtimeVersionResolver = new VersionResolver(workerContext);
            commandContext.version = await runtimeVersionResolver.getFullVersion(commandContext.version, mode);

            const acquisitionInvoker = new AcquisitionInvoker(workerContext, utilContext);
            return mode === 'aspnetcore' ? worker.acquireLocalASPNET(workerContext, acquisitionInvoker) : worker.acquireLocalRuntime(workerContext, acquisitionInvoker);
        }, getIssueContext(existingPathConfigWorker)(commandContext.errorConfiguration, 'acquire', commandContext.version), commandContext.requestingExtensionId, workerContext);

        const installationId = getInstallIdCustomArchitecture(commandContext.version, commandContext.architecture, mode, 'local');
        const install = {
            installId: installationId, version: commandContext.version, installMode: mode, isGlobal: false,
            architecture: commandContext.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture()
        } as DotnetInstall;

        if (dotnetPath !== undefined && dotnetPath?.dotnetPath)
        {
            globalEventStream.post(new DotnetAcquisitionTotalSuccessEvent(commandContext.version, install, commandContext.requestingExtensionId ?? '', dotnetPath.dotnetPath));
        }

        loggingObserver.dispose();
        return dotnetPath;
    });

    const dotnetAcquireGlobalSDKRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquireGlobalSDK}`, async (commandContext: IDotnetAcquireContext): Promise<IDotnetAcquireResult | undefined> =>
    {
        commandContext.mode = commandContext.mode ?? 'sdk' as DotnetInstallMode;

        if (commandContext.requestingExtensionId === undefined)
        {
            return Promise.reject(new Error('No requesting extension id was provided.'));
        }

        let fullyResolvedVersion = '';
        const workerContext = getAcquisitionWorkerContext(commandContext.mode, commandContext);
        const worker = getAcquisitionWorker();

        const pathResult = await callWithErrorHandling(async () =>
        {
            // Warning: Between now and later in this call-stack, the context 'version' is incomplete as it has not been resolved.
            // Errors between here and the place where it is resolved cannot be routed to one another.

            telemetryObserver?.setAcquisitionContext(workerContext, commandContext);

            if (commandContext.version === '' || !commandContext.version)
            {
                throw new EventCancellationError('BadContextualRuntimeVersionError',
                    `No version was defined to install.`);
            }

            globalEventStream.post(new DotnetAcquisitionRequested(commandContext.version, commandContext.requestingExtensionId ?? 'notProvided', commandContext.mode!, commandContext.installType ?? 'global'));

            const existingOfflinePath = await getExistingInstallIfOffline(worker, workerContext);
            if (existingOfflinePath)
            {
                return Promise.resolve(existingOfflinePath);
            }

            const globalInstallerResolver = new GlobalInstallerResolver(workerContext, commandContext.version);
            fullyResolvedVersion = await globalInstallerResolver.getFullySpecifiedVersion();

            // Reset context to point to the fully specified version so it is not possible for someone to access incorrect data during the install process.
            // Note: This will impact the context object given to the worker and error handler since objects own a copy of a reference in JS.
            commandContext.version = fullyResolvedVersion;
            telemetryObserver?.setAcquisitionContext(workerContext, commandContext);

            outputChannel.show(true);
            const dotnetPath = await worker.acquireGlobalSDK(workerContext, globalInstallerResolver);

            new CommandExecutor(workerContext, utilContext).setPathEnvVar(dotnetPath.dotnetPath, moreInfoUrl, displayWorker, vsCodeExtensionContext, true);
            return dotnetPath;
        }, getIssueContext(existingPathConfigWorker)(commandContext.errorConfiguration, commandKeys.acquireGlobalSDK), commandContext.requestingExtensionId, workerContext);

        const installationId = getInstallIdCustomArchitecture(commandContext.version, commandContext.architecture, commandContext.mode, 'global');
        const install = {
            installId: installationId, version: commandContext.version, installMode: commandContext.mode, isGlobal: true,
            architecture: commandContext.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture()
        } as DotnetInstall;

        if (pathResult !== undefined && pathResult?.dotnetPath)
        {
            globalEventStream.post(new DotnetAcquisitionTotalSuccessEvent(commandContext.version, install, commandContext.requestingExtensionId ?? '', pathResult.dotnetPath));
        }

        loggingObserver.dispose();
        return pathResult;
    });

    const dotnetListVersionsRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.listVersions}`,
        async (commandContext: IDotnetListVersionsContext | undefined, customWebWorker: WebRequestWorkerSingleton | undefined): Promise<IDotnetListVersionsResult | undefined> =>
        {
            return getAvailableVersions(commandContext, customWebWorker, false);
        });

    const dotnetRecommendedVersionRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.recommendedVersion}`,
        async (commandContext: IDotnetListVersionsContext | undefined, customWebWorker: WebRequestWorkerSingleton | undefined): Promise<IDotnetListVersionsResult> =>
        {
            const recommendation = await callWithErrorHandling(async () =>
            {
                const availableVersions = await getAvailableVersions(commandContext, customWebWorker, true) ?? [];
                const activeSupportVersions = availableVersions?.filter((version: IDotnetVersion) => version.supportPhase === 'active');

                if (!activeSupportVersions || (activeSupportVersions?.length ?? 0) < 1)
                {
                    const err = new EventCancellationError('DotnetVersionResolutionError', `An active-support version of dotnet couldn't be found. Discovered versions: ${JSON.stringify(availableVersions)}`);
                    globalEventStream.post(new DotnetVersionResolutionError(err, null));
                    if (!availableVersions || (availableVersions?.length ?? 0) < 1)
                    {
                        return [];
                    }
                    else
                    {
                        return [availableVersions[0]];
                    }
                }

                // The first item will be the newest version.
                return [activeSupportVersions[0]];
            }, getIssueContext(existingPathConfigWorker)(commandContext?.errorConfiguration, 'acquireStatus'));

            return recommendation ?? [];
        });


    const acquireGlobalSDKPublicRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.globalAcquireSDKPublic}`, async (commandContext: IDotnetAcquireContext | undefined) =>
    {
        globalEventStream.post(new GlobalAcquisitionContextMenuOpened(`The user has opened the global SDK acquisition context menu.`));

        const recommendedVersionResult: IDotnetListVersionsResult = await vscode.commands.executeCommand('dotnet.recommendedVersion', { listRuntimes: false, errorConfiguration: commandContext?.errorConfiguration } as IDotnetListVersionsContext);
        globalEventStream.post(new DotnetVersionCategorizedEvent(`Recommended versions: ${JSON.stringify(recommendedVersionResult ?? '')}.`));


        const recommendedVersion: string = recommendedVersionResult ? recommendedVersionResult[0]?.version : '';
        globalEventStream.post(new DotnetVersionCategorizedEvent(`Recommending version: ${recommendedVersion}.`));

        const chosenVersion = (await vscode.window.showInputBox(
            {
                placeHolder: recommendedVersion,
                value: recommendedVersion,
                prompt: 'The .NET SDK version. You can use different formats: 5, 3.1, 7.0.3xx, 6.0.201, etc.',
            })) ?? recommendedVersion;

        globalEventStream.post(new UserManualInstallVersionChosen(`The user has chosen to install the .NET SDK version ${chosenVersion}.`));

        try
        {
            globalEventStream.post(new UserManualInstallRequested(`Starting to install the .NET SDK ${chosenVersion} via a user request.`));

            await vscode.commands.executeCommand('dotnet.showAcquisitionLog');
            const userCommandContext: IDotnetAcquireContext = { version: chosenVersion, requestingExtensionId: 'user', installType: 'global' };
            const path: IDotnetAcquireResult = await vscode.commands.executeCommand('dotnet.acquireGlobalSDK', userCommandContext);
            if (path && path?.dotnetPath)
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

    const dotnetAcquireStatusRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.acquireStatus}`, async (commandContext: IDotnetAcquireContext): Promise<IDotnetAcquireResult | undefined> =>
    {
        const pathResult = await callWithErrorHandling(async () =>
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

    const resetDataPublicRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.resetData}`, async () =>
    {
        const uninstallContext: IDotnetUninstallContext = {
            errorConfiguration: UninstallErrorConfiguration.DisplayAllErrorPopups,
        };
        return uninstallAll(uninstallContext);
    });

    const dotnetUninstallPublicRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.uninstallPublic}`, async () =>
    {
        const existingInstalls = await InstallTrackerSingleton.getInstance(globalEventStream, vsCodeContext.globalState).getExistingInstalls(directoryProviderFactory(
            'runtime', vsCodeContext.globalStoragePath));

        const menuItems = existingInstalls?.sort(
            function (x: InstallRecord, y: InstallRecord): number
            {
                if (x.dotnetInstall.installMode === y.dotnetInstall.installMode)
                {
                    return x.dotnetInstall.version.localeCompare(y.dotnetInstall.version);
                }
                return x.dotnetInstall.installMode.localeCompare(y.dotnetInstall.installMode);
            })?.map(install =>
            {
                return {
                    label: `.NET ${(install.dotnetInstall.installMode === 'sdk' ? 'SDK' : install.dotnetInstall.installMode === 'runtime' ? 'Runtime' : 'ASP.NET Core Runtime')} ${install.dotnetInstall.version}`,
                    description: `${install.dotnetInstall.architecture ?? ''} | ${install.dotnetInstall.isGlobal ? 'machine-wide' : 'vscode-local'}`,
                    detail: install.installingExtensions.some(x => x !== null) ? `Used by ${install.installingExtensions.join(', ')}` : ``,
                    iconPath: install.dotnetInstall.isGlobal ? new vscode.ThemeIcon('shield') : new vscode.ThemeIcon('trash'),
                    internalId: install.dotnetInstall.installId
                }
            });

        if ((menuItems?.length ?? 0) < 1)
        {
            vscode.window.showInformationMessage('No .NET installations were found to uninstall.');
            return;
        }

        const chosenVersion = await vscode.window.showQuickPick(menuItems, { placeHolder: 'Select a version to uninstall.' });

        if (chosenVersion)
        {
            const installRecord: InstallRecord = existingInstalls.find(install => install.dotnetInstall.installId === chosenVersion.internalId)!;

            if (!installRecord || !installRecord?.dotnetInstall?.version || !installRecord?.dotnetInstall?.installMode)
            {
                return;
            }

            const selectedInstall: DotnetInstall = installRecord.dotnetInstall;
            let canContinue = true;
            const uninstallWillBreakSomething = !(await InstallTrackerSingleton.getInstance(globalEventStream, vsCodeContext.globalState).canUninstall(selectedInstall, directoryProviderFactory(
                'runtime', vsCodeContext.globalStoragePath), true));

            const yes = `Continue`;
            if (uninstallWillBreakSomething)
            {
                const brokenExtensions = installRecord.installingExtensions.some(x => x !== null) ? installRecord.installingExtensions.join(', ') : 'extensions such as C# or C# DevKit';
                const pick = await vscode.window.showWarningMessage(
                    `Uninstalling .NET ${selectedInstall.version} will likely cause ${brokenExtensions} to stop functioning properly. Do you still wish to continue?`, { modal: true }, yes);
                canContinue = pick === yes;
            }

            if (!canContinue)
            {
                return;
            }

            const commandContext: IDotnetAcquireContext =
            {
                version: selectedInstall.version,
                mode: selectedInstall.installMode,
                installType: selectedInstall.isGlobal ? 'global' : 'local',
                architecture: selectedInstall.architecture,
                requestingExtensionId: 'user'
            }

            outputChannel.show(true);
            return uninstall(commandContext, true);
        }
    });

    /**
     * @returns 0 on success. Error string if not.
     */
    const dotnetUninstallRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.uninstall}`, async (commandContext: IDotnetAcquireContext | undefined): Promise<string> =>
    {
        return uninstall(commandContext);
    });

    /**
     * @param commandContext The context of the request to find the dotnet path.
     * We wrap an AcquisitionContext which must include the version, requestingExtensionId, architecture of .NET desired, and mode.
     * The architecture should be of the node format ('x64', 'x86', 'arm64', etc.)
     *
     * @returns the path to the dotnet executable as an IDotnetAcquireResult (or undefined), if one can be found. This should be the true path to the executable. undefined if none can be found.
     * Before version 2.2.2, the result could be a string, undefined, or an IDotnetAcquireResult. This was changed to be more consistent with the rest of the APIs.
     *
     * @remarks Priority Order for path lookup:
     * VSCode Setting -> PATH -> Realpath of PATH -> DOTNET_ROOT (Emulation DOTNET_ROOT if set first)
     *
     * This accounts for pmc installs, snap installs, bash configurations, and other non-standard installations such as homebrew.
     */
    const dotnetFindPathRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.findPath}`, async (commandContext: IDotnetFindPathContext): Promise<IDotnetAcquireResult | undefined> =>
    {
        globalEventStream.post(new DotnetFindPathCommandInvoked(`The find path command was invoked.`, commandContext));

        if (!commandContext.acquireContext.mode || !commandContext.acquireContext.requestingExtensionId || !commandContext.acquireContext.version || !commandContext.acquireContext.architecture)
        {
            throw new EventCancellationError('BadContextualFindPathError', `The find path request was missing required information: a mode, version, architecture, and requestingExtensionId.`);
        }
        const requestedArchitecture = commandContext.acquireContext.architecture;

        globalEventStream.post(new DotnetFindPathLookupSetting(`Looking up vscode setting.`));
        const workerContext = getAcquisitionWorkerContext(commandContext.acquireContext.mode, commandContext.acquireContext);
        const existingPath = await resolveExistingPathIfExists(existingPathConfigWorker, commandContext.acquireContext, workerContext, utilContext, commandContext.versionSpecRequirement);

        // The setting is not intended to be used as the SDK, only the runtime for extensions to run on. Ex: PowerShell policy doesn't allow us to install the runtime, let users set the path manually.
        if (existingPath && commandContext.acquireContext.mode !== 'sdk')
        {
            // We don't need to validate the existing path as it gets validated in the lookup logic already.
            globalEventStream.post(new DotnetFindPathSettingFound(`Found vscode setting.`));
            loggingObserver.dispose();
            return existingPath;
        }

        const validator = new DotnetConditionValidator(workerContext, utilContext);
        const finder = new DotnetPathFinder(workerContext, utilContext);

        const dotnetOnShellSpawn = (await finder.findDotnetFastFromListOnly(requestedArchitecture))?.[0] ?? '';
        if (dotnetOnShellSpawn)
        {
            const validatedShellSpawn = await getPathIfValid(dotnetOnShellSpawn, validator, commandContext);
            if (validatedShellSpawn)
            {
                loggingObserver.dispose();
                return { dotnetPath: validatedShellSpawn };
            }
        }

        const dotnetsOnPATH = await finder.findRawPathEnvironmentSetting(true, requestedArchitecture);
        for (const dotnetPath of dotnetsOnPATH ?? [])
        {
            const validatedPATH = await getPathIfValid(dotnetPath, validator, commandContext);
            if (validatedPATH)
            {
                loggingObserver.dispose();
                return { dotnetPath: validatedPATH };
            }
        }

        const dotnetsOnRealPATH = await finder.findRealPathEnvironmentSetting(true, requestedArchitecture);
        for (const dotnetPath of dotnetsOnRealPATH ?? [])
        {
            const validatedRealPATH = await getPathIfValid(dotnetPath, validator, commandContext);
            if (validatedRealPATH)
            {
                loggingObserver.dispose();
                return { dotnetPath: validatedRealPATH };
            }
        }

        const dotnetOnROOT = await finder.findDotnetRootPath(commandContext.acquireContext.architecture);
        const validatedRoot = await getPathIfValid(dotnetOnROOT, validator, commandContext);
        if (validatedRoot)
        {
            loggingObserver.dispose();
            return { dotnetPath: validatedRoot };
        }

        const dotnetOnHostfxrRecord = await finder.findHostInstallPaths(commandContext.acquireContext.architecture);
        for (const dotnetPath of dotnetOnHostfxrRecord ?? [])
        {
            const validatedHostfxr = await getPathIfValid(dotnetPath, validator, commandContext);
            if (validatedHostfxr && process.env.DOTNET_INSTALL_TOOL_SKIP_HOSTFXR !== 'true')
            {
                loggingObserver.dispose();
                return { dotnetPath: validatedHostfxr };
            }
        }

        loggingObserver.dispose();
        globalEventStream.post(new DotnetFindPathNoPathMetCondition(`Could not find a single host path that met the conditions.
existingPath : ${existingPath?.dotnetPath}
onPath : ${JSON.stringify(dotnetsOnPATH)}
onRealPath : ${JSON.stringify(dotnetsOnRealPATH)}
onRoot : ${dotnetOnROOT}
onHostfxrRecord : ${JSON.stringify(dotnetOnHostfxrRecord)}

Requirement:
${JSON.stringify(commandContext)}`));
        return undefined;
    });

    async function getPathIfValid(path: string | undefined, validator: IDotnetConditionValidator, commandContext: IDotnetFindPathContext): Promise<string | undefined>
    {
        if (path)
        {
            const validated = await validator.dotnetMeetsRequirement(path, commandContext);
            if (validated)
            {
                globalEventStream.post(new DotnetFindPathMetCondition(`${path} met the conditions.`));
                return path;
            }
        }

        return undefined;
    }

    async function uninstall(commandContext: IDotnetAcquireContext | undefined, force = false): Promise<string>
    {
        let result = '1';
        await callWithErrorHandling(async () =>
        {
            if (!commandContext?.version || !commandContext?.installType || !commandContext?.mode || !commandContext?.requestingExtensionId)
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

                if (commandContext.installType === 'local' && !force) // if using force mode, we are also using the UI, which passes the fully specified version to uninstall only
                {
                    const versionResolver = new VersionResolver(workerContext);
                    const resolvedVersion = await versionResolver.getFullVersion(commandContext.version, commandContext.mode);
                    commandContext.version = resolvedVersion;
                }

                const installationId = getInstallIdCustomArchitecture(commandContext.version, commandContext.architecture, commandContext.mode, commandContext.installType);
                const install = {
                    installId: installationId, version: commandContext.version, installMode: commandContext.mode, isGlobal: commandContext.installType === 'global',
                    architecture: commandContext.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture()
                } as DotnetInstall;

                if (commandContext.installType === 'local')
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

    const dotnetUninstallAllRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.uninstallAll}`, async (commandContext: IDotnetUninstallContext | undefined) =>
    {
        return uninstallAll(commandContext);
    });

    async function uninstallAll(commandContext: IDotnetUninstallContext | undefined): Promise<number>
    {
        await callWithErrorHandling(async () =>
        {
            const mode = 'runtime' as DotnetInstallMode;
            const worker = getAcquisitionWorker();
            const installDirectoryProvider = directoryProviderFactory(mode, vsCodeContext.globalStoragePath);

            await worker.uninstallAll(globalEventStream, installDirectoryProvider.getStoragePath(), vsCodeContext.globalState);
        },
            getIssueContext(existingPathConfigWorker)(commandContext ? commandContext.errorConfiguration : undefined, 'uninstallAll')
        );

        return Promise.resolve(0);
    }

    const showOutputChannelRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.showAcquisitionLog}`, () => outputChannel.show(/* preserveFocus */ false));

    const ensureDependenciesRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.ensureDotnetDependencies}`, async (commandContext: IDotnetEnsureDependenciesContext) =>
    {
        await callWithErrorHandling(async () =>
        {
            if (os.platform() !== 'linux')
            {
                // We can't handle installing dependencies for anything other than Linux
                return;
            }

            const result = cp.spawnSync(commandContext.command, commandContext.arguments);
            const installer = new DotnetCoreDependencyInstaller();
            if (installer.signalIndicatesMissingLinuxDependencies(result.signal!))
            {
                globalEventStream.post(new DotnetAcquisitionMissingLinuxDependencies());
                await installer.promptLinuxDependencyInstall('Failed to run .NET runtime.');
            }
        }, getIssueContext(existingPathConfigWorker)(commandContext.errorConfiguration, 'ensureDependencies'));
    });

    const reportIssueRegistration = vscode.commands.registerCommand(`${commandPrefix}.${commandKeys.reportIssue}`, async () =>
    {
        const [url, issueBody] = formatIssueUrl(undefined, getIssueContext(existingPathConfigWorker)(AcquireErrorConfiguration.DisableErrorPopups, 'reportIssue'));
        await vscode.env.clipboard.writeText(issueBody);
        open(url).catch(() => {});
    });

    // Helper Functions
    async function resolveExistingPathIfExists(configResolver: ExtensionConfigurationWorker, commandContext: IDotnetAcquireContext,
        workerContext: IAcquisitionWorkerContext, utilityContext: IUtilityContext, requirement?: DotnetVersionSpecRequirement): Promise<IDotnetAcquireResult | null>
    {
        const existingPathResolver = new ExistingPathResolver(workerContext, utilityContext);

        const existingPath = await existingPathResolver.resolveExistingPath(configResolver.getAllPathConfigurationValues(), commandContext.requestingExtensionId, displayWorker, requirement);
        if (existingPath)
        {
            globalEventStream.post(new DotnetExistingPathResolutionCompleted(existingPath.dotnetPath));
            return new Promise((resolve) =>
            {
                resolve(existingPath);
            });
        }
        return new Promise((resolve) =>
        {
            resolve(null);
        });
    }

    const getAvailableVersions = async (commandContext: IDotnetListVersionsContext | undefined,
        customWebWorker: WebRequestWorkerSingleton | undefined, onRecommendationMode: boolean): Promise<IDotnetListVersionsResult | undefined> =>
    {
        const mode = 'sdk' as DotnetInstallMode;
        const workerContext = getVersionResolverContext(mode, 'global', commandContext?.errorConfiguration);
        const customVersionResolver = new VersionResolver(workerContext, customWebWorker);

        if (os.platform() !== 'linux' || !onRecommendationMode)
        {
            const versionsResult = await callWithErrorHandling(async () =>
            {
                return customVersionResolver.GetAvailableDotnetVersions(commandContext);
            }, getIssueContext(existingPathConfigWorker)(commandContext?.errorConfiguration, 'getAvailableVersions'));

            return versionsResult;
        }
        else
        {
            const linuxResolver = new LinuxVersionResolver(workerContext, utilContext);
            try
            {
                const suggestedVersion = await linuxResolver.getRecommendedDotnetVersion('sdk' as DotnetInstallMode);
                const osAgnosticVersionData = await getAvailableVersions(commandContext, customWebWorker, !onRecommendationMode);
                const resolvedSupportPhase = osAgnosticVersionData?.find((version: IDotnetVersion) =>
                    getMajorMinor(version.version, globalEventStream, workerContext) === getMajorMinor(suggestedVersion, globalEventStream, workerContext))?.supportPhase ?? 'active';
                // Assumption : The newest version is 'active' support, but we can't guarantee that.
                // If the linux version is too old it will eventually support no active versions of .NET, which would cause a failure.
                // The best we can give it is the newest working version, which is the most likely to be supported, and mark it as active so we can use it.

                return [
                    {
                        version: suggestedVersion, channelVersion: `${getMajorMinor(suggestedVersion, globalEventStream, workerContext)}`,
                        supportStatus: Number(getMajor(suggestedVersion, globalEventStream, workerContext)) % 2 === 0 ? 'lts' : 'sts',
                        supportPhase: resolvedSupportPhase
                    }
                ];
            }
            catch (error: any)
            {
                return [];
            }
        }
    }

    /**
     * @returns A 'worker' context object that can be used for when there actually isn't any acquisition happening.
     * Eventually the version resolver and web request worker should be decoupled from the context object, ...
     * so we don't need to do this, but not doing this right now.
     */
    function getVersionResolverContext(mode: DotnetInstallMode, typeOfInstall: DotnetInstallType, errorsConfiguration?: ErrorConfiguration): IAcquisitionWorkerContext
    {
        return getAcquisitionWorkerContext(mode,
            {
                requestingExtensionId: 'notProvided',
                installType: typeOfInstall,
                version: 'notAnAcquisitionRequest',
                errorConfiguration: errorsConfiguration,
                architecture: DotnetCoreAcquisitionWorker.defaultArchitecture(),
                mode
            } as IDotnetAcquireContext
        )
    }

    function getAcquisitionWorkerContext(mode: DotnetInstallMode, acquiringContext: IDotnetAcquireContext): IAcquisitionWorkerContext
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
            isExtensionTelemetryInitiallyEnabled: isExtensionTelemetryEnabled,
            allowInvalidPathSetting: allowInvalidPathSetting ?? false
        }
    }

    function getAcquisitionWorker(): DotnetCoreAcquisitionWorker
    {
        return new DotnetCoreAcquisitionWorker(utilContext, vsCodeExtensionContext);
    }

    function getIssueContext(configResolver: ExtensionConfigurationWorker)
    {
        return (errorConfiguration: ErrorConfiguration | undefined, commandName: string, version?: string) =>
        {
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

    async function getExistingInstallIfOffline(worker: DotnetCoreAcquisitionWorker, workerContext: IAcquisitionWorkerContext): Promise<IDotnetAcquireResult | null>
    {
        if (!(await WebRequestWorkerSingleton.getInstance().isOnline(timeoutValue ?? defaultTimeoutValue, globalEventStream)))
        {
            workerContext.acquisitionContext.architecture ??= DotnetCoreAcquisitionWorker.defaultArchitecture();
            const existingOfflinePath = await worker.getSimilarExistingInstall(workerContext);
            if (existingOfflinePath?.dotnetPath)
            {
                return Promise.resolve(existingOfflinePath);
            }
            else
            {
                globalEventStream.post(new DotnetOfflineWarning(`It looks like you may be offline (can you connect to www.microsoft.com?) and have no installations of .NET for VS Code.
We will try to install .NET, but are unlikely to be able to connect to the server. Installation will timeout in ${timeoutValue} seconds.`))
            }
        }

        return null;
    }

    // Preemptively install .NET for extensions who tell us to in their package.json
    const jsonInstaller = new JsonInstaller(globalEventStream, vsCodeExtensionContext);

    // Exposing API Endpoints
    vsCodeContext.subscriptions.push(
        dotnetAcquireRegistration,
        dotnetAcquireStatusRegistration,
        dotnetAcquireGlobalSDKRegistration,
        acquireGlobalSDKPublicRegistration,
        dotnetFindPathRegistration,
        dotnetListVersionsRegistration,
        dotnetRecommendedVersionRegistration,
        dotnetUninstallRegistration,
        dotnetUninstallPublicRegistration,
        dotnetUninstallAllRegistration,
        showOutputChannelRegistration,
        ensureDependenciesRegistration,
        reportIssueRegistration,
        ...eventStreamObservers);

    if (showResetDataCommand)
    {
        vsCodeContext.subscriptions.push(resetDataPublicRegistration);
    }
}

export function ReEnableActivationForManualActivation()
{
    disableActivationUnderTest = false;
}
