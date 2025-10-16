/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as crypto from 'crypto';
import * as path from 'path';
import { IEventStream } from '../EventStream/EventStream';
import
{
    AddTrackingVersions,
    CanIgnoreLiveDependents,
    ConvertingLegacyInstallRecord,
    DependentIsDead,
    DuplicateInstallDetected,
    FoundTrackingVersions,
    LiveDependentInUse,
    MarkedInstallInUse,
    ProcessEnvironmentCheck,
    RemovingExtensionFromList,
    RemovingOwnerFromList,
    RemovingVersionFromExtensionState,
    SearchingLiveDependents,
    SessionMutexAcquisitionFailed,
    SessionMutexReleased,
    SkipAddingInstallEvent
} from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';
import { EventStreamNodeIPCMutexLoggerWrapper } from '../Utils/EventStreamNodeIPCMutexWrapper';
import { getAssumedInstallInfo } from '../Utils/InstallIdUtilities';
import { NodeIPCMutex } from '../Utils/NodeIPCMutex';
import { deserializeMapOfSets, serializeMapOfSets } from '../Utils/SerializationHelpers';
import { executeWithLock, getDotnetExecutable } from '../Utils/TypescriptUtilities';
import
{
    DotnetInstall,
    DotnetInstallWithKey,
    InstallToStrings,
    IsEquivalentInstallation
} from './DotnetInstall';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IInstallationDirectoryProvider } from './IInstallationDirectoryProvider';
import { InstallOwner, InstallRecord, InstallRecordOrStr } from './InstallRecord';

export type InstallState = 'installing' | 'installed';

export type SessionsWithInUseExecutables = Map<string, Set<string>>;

export class InstallTrackerSingleton
{
    protected static instance: InstallTrackerSingleton;
    protected static sessionId: string; // If we ever add a public static function that utilizes this, this needs to be made not-static.
    protected static sessionMutexReleaser?: (() => void);
    protected static readonly SESSION_MUTEX_ACQUIRE_TIMEOUT_MS = 100;
    protected static readonly SESSION_MUTEX_PING_DURATION = 50;

    protected sessionInstallsKey = 'dotnet.returnedInstallDirectories';

    protected constructor(protected eventStream: IEventStream, protected extensionState: IExtensionState, protected instantiateReleaseFunction = true)
    {
        const hash = crypto.createHash('sha256');
        hash.update(process.pid.toString() + crypto.randomBytes(8).toString('hex')); // add random salt to avoid PID collision
        InstallTrackerSingleton.sessionId = `session-${hash.digest('hex').slice(0, 10)}`;
        if (instantiateReleaseFunction)
        {
            InstallTrackerSingleton.sessionMutexReleaser = undefined;
            this.acquirePermanentSessionMutex();
        }
    }

    /**
     * Acquires a mutex associated with the current session and holds it for the lifetime
     * of the process without blocking any threads.
     *
     * This is used to indicate that this session is still alive to other processes
     * that may want to check if installations from this session are still in use.
     */
    protected acquirePermanentSessionMutex(): void
    {
        const logger = new EventStreamNodeIPCMutexLoggerWrapper(this.eventStream, InstallTrackerSingleton.sessionId);
        const mutex = new NodeIPCMutex(InstallTrackerSingleton.sessionId, logger, '');

        mutex.acquireWithManualRelease(InstallTrackerSingleton.sessionId, InstallTrackerSingleton.SESSION_MUTEX_PING_DURATION, InstallTrackerSingleton.SESSION_MUTEX_ACQUIRE_TIMEOUT_MS).catch((error) =>
        {
            this.eventStream.post(new SessionMutexAcquisitionFailed(`Failed to acquire permanent mutex for session ${InstallTrackerSingleton.sessionId}: ${error}`));
        }).then((resolved) =>
        {
            if (resolved)
            {
                InstallTrackerSingleton.sessionMutexReleaser = resolved;
            }
        }).catch(() => {}); // Assumption : We can ignore these errors because install/uninstall won't work if mutexes are unacquireable
    }

    /**
     * Ends the session by releasing the permanent mutex.
     * This is primarily intended for testing scenarios, because the test runner will never exit if there is any remaining promise.
     * @returns A promise that resolves when the mutex is released
     */
    protected async endSession(): Promise<void>
    {
        // Wait for the release function to get returned - this prevents delaying startup for test scenarios where we want to release the mutex, since the ctor cannot await
        // * 2 is due to the possibility of the first ping requiring a resolution of the mutex to release
        await new Promise(resolve => setTimeout(resolve, InstallTrackerSingleton.SESSION_MUTEX_ACQUIRE_TIMEOUT_MS + InstallTrackerSingleton.SESSION_MUTEX_PING_DURATION * 2));

        if (InstallTrackerSingleton.sessionMutexReleaser !== undefined)
        {
            // Call the resolver function to resolve the promise and release the mutex
            InstallTrackerSingleton.sessionMutexReleaser();
            InstallTrackerSingleton.sessionMutexReleaser = undefined;
            this.eventStream.post(new SessionMutexReleased(`Session ${InstallTrackerSingleton.sessionId} has released its permanent mutex`));

            // Don't return until we are sure it's been released to prevent race condition confusion
            await new Promise(resolve => setTimeout(resolve, InstallTrackerSingleton.SESSION_MUTEX_ACQUIRE_TIMEOUT_MS + InstallTrackerSingleton.SESSION_MUTEX_PING_DURATION * 2));
        }
    }

    /**
     * Restarts the session mutex after it has been released.
     * This is primarily intended for testing scenarios.
     * @returns A promise that resolves when the mutex is acquired or when the timeout is reached
     */
    protected async restartSessionMutex(): Promise<void>
    {
        // Wait for the release function to get returned - this prevents delaying startup for test scenarios where we want to release the mutex, since the ctor cannot await
        await new Promise(resolve => setTimeout(resolve, InstallTrackerSingleton.SESSION_MUTEX_ACQUIRE_TIMEOUT_MS + InstallTrackerSingleton.SESSION_MUTEX_PING_DURATION * 2));

        // Only restart if the session isn't currently active
        if (InstallTrackerSingleton.sessionMutexReleaser === undefined)
        {
            this.acquirePermanentSessionMutex();

            // Wait for the acquisition to complete or timeout
            await new Promise(resolve => setTimeout(resolve, InstallTrackerSingleton.SESSION_MUTEX_ACQUIRE_TIMEOUT_MS + InstallTrackerSingleton.SESSION_MUTEX_PING_DURATION * 2));
            if (InstallTrackerSingleton.sessionMutexReleaser === undefined)
            {
                throw new Error(`Failed to acquire session mutex within ${InstallTrackerSingleton.SESSION_MUTEX_ACQUIRE_TIMEOUT_MS}ms`);
            }
        }
    }

    public static getInstance(eventStream: IEventStream, extensionState: IExtensionState): InstallTrackerSingleton
    {
        if (!InstallTrackerSingleton.instance)
        {
            InstallTrackerSingleton.instance = new InstallTrackerSingleton(eventStream, extensionState);
        }

        return InstallTrackerSingleton.instance;
    }

    protected overrideMembers(eventStream: IEventStream, extensionState: IExtensionState)
    {
        InstallTrackerSingleton.instance.eventStream = eventStream;
        InstallTrackerSingleton.instance.extensionState = extensionState;
    }

    /**
     * Checks if an install has no live dependents besides a specific extension.
     * @param installExePath The path of the executable to check for 'live' dependents of sessions of code/insiders/code forks that are running processes
     * @param dirProvider The directory in which the install records may attach to - optional if the Id to ignore is irrelevant
     * @param liveExtensionOwnerToIgnore - The extensionId that we don't care about if it's a live dependent or not - it will be ignored and not considered a dependent regardless.
     * @param dotnetInstall - the install object that extensions may take a dependency on
     * @returns True if there are no currently running extensions (cross process and forks of vscode) that depend on this install.
     * @remarks Having an extension id to ignore allows an extension that may have used a dotnet install in this process to tell us we can uninstall it, as it's no longer using it.
     */
    public async installHasNoLiveDependentsBesidesId(installExePath: string, dirProvider: IInstallationDirectoryProvider | null, liveExtensionOwnerToIgnore: string, dotnetInstall: DotnetInstall | null)
    {
        return executeWithLock(this.eventStream, false, this.getLockFilePathForKeySimple('installed'), 5, 200000,
            async () =>
            {
                const serializedData = this.extensionState.get<Record<string, string[]>>(this.sessionInstallsKey, {});
                const existingSessionsWithUsedExecutablePaths = deserializeMapOfSets<string, string>(serializedData);

                this.eventStream.post(new SearchingLiveDependents(`Searching for live dependents of install at ${installExePath}. Sessions: ${JSON.stringify(serializedData)}`));

                if (liveExtensionOwnerToIgnore !== '' && dirProvider !== null && dotnetInstall !== null)
                {
                    const existingInstalls = await this.getExistingInstalls(dirProvider, true);
                    const installRecord: InstallRecord | undefined = existingInstalls.filter(x => IsEquivalentInstallation(x.dotnetInstall, dotnetInstall))?.[0];

                    const installRecordExistsButOnlyOwnerShouldBeIgnored = installRecord && installRecord.installingExtensions.length === 1 && installRecord.installingExtensions?.[0] === liveExtensionOwnerToIgnore;
                    const installRecordExistsWithNoOwner = installRecord && (installRecord.installingExtensions?.length ?? 0) === 0;
                    if (!installRecord || installRecordExistsButOnlyOwnerShouldBeIgnored || installRecordExistsWithNoOwner)
                    {
                        // There may be live dependents, but the only extensions which depend on this install are to be ignored
                        // Generally this is for when the extension which installed the runtime in this session wants to uninstall the runtime it installed
                        // A flaw in this logic is if there are other dependents that don't need the install and didn't call uninstall (to decrement the ref count), we can't uninstall automatically until next time
                        this.eventStream.post(new CanIgnoreLiveDependents(`Ignoring the live dependent(s) as they match ${liveExtensionOwnerToIgnore}.`))
                        return true;
                    }
                }

                for (const [sessionId, exePaths] of existingSessionsWithUsedExecutablePaths)
                {
                    if (sessionId === InstallTrackerSingleton.sessionId && exePaths.has(installExePath))
                    {
                        this.eventStream.post(new LiveDependentInUse(`Dependent is in use by this session, so we can't uninstall it.`))
                        return false; // Our session must be live if this code is running.
                    }

                    // See if the session is still 'live' - there is no way to ensure we remove it on exit/os crash
                    const logger = new EventStreamNodeIPCMutexLoggerWrapper(this.eventStream, sessionId);
                    const mutex = new NodeIPCMutex(sessionId, logger, ``);

                    const shouldContinue = await mutex.acquire(async () =>
                    {
                        // eslint-disable-next-line no-return-await
                        this.eventStream.post(new DependentIsDead(`Dependent Session ${sessionId} is no longer live - continue searching dependents.`))
                        existingSessionsWithUsedExecutablePaths.delete(sessionId);
                        await this.extensionState.update(this.sessionInstallsKey, serializeMapOfSets(existingSessionsWithUsedExecutablePaths));
                        return Promise.resolve(true);
                    }, 10, 30, `${sessionId}-${crypto.randomUUID()}`).catch(() => { return false; });
                    if (!shouldContinue && exePaths.has(installExePath))
                    {
                        this.eventStream.post(new LiveDependentInUse(`Install ${installExePath} is in use by session ${sessionId}, so we can't uninstall it.`))
                        return false; // We couldn't acquire the mutex, so the session must be live
                    }
                }

                // If the user hard-coded their PATH to include the vscode extension install (not a good practice), we likely don't want to uninstall it.
                const processEnvironmentDependsOnInstall = (process.env.PATH?.includes(path.dirname(installExePath)) ?? false) ||
                    (process.env.DOTNET_ROOT?.includes(path.dirname(installExePath)) ?? false);
                this.eventStream.post(new ProcessEnvironmentCheck(`Process environment PATH or DOTNET_ROOT depends on install? ${processEnvironmentDependsOnInstall}`));
                return !processEnvironmentDependsOnInstall;
            });
    }

    /**
     *
     * @param installExePath the full path to the dotnet executable of the install to check
     * @returns Whether an install has a 'live' dependent. In other words, if we have returned this executable to a process to use.
     * In addition, we check whether the user has set the PATH to a local install, in case we never return it but the user relies on it externally.
     */
    public async installHasNoLiveDependents(installExePath: string): Promise<boolean>
    {
        return this.installHasNoLiveDependentsBesidesId(installExePath, null, '', null);
    }

    public async installHasNoDependents(dotnetInstall: DotnetInstall, dirProvider: IInstallationDirectoryProvider, allowUninstallUserOnlyInstall = false, extensionIdToIgnoreForLiveDependent = ''): Promise<boolean>
    {
        const hasNoRegisteredDependents = await this.installHasNoRegisteredDependentsBesidesId(dotnetInstall, dirProvider, allowUninstallUserOnlyInstall, extensionIdToIgnoreForLiveDependent);
        const installExecutablePath = path.join(dirProvider.getInstallDir(dotnetInstall.installId), getDotnetExecutable());
        const hasNoLiveDependentsBesidesExtensionToIgnore = await this.installHasNoLiveDependentsBesidesId(installExecutablePath, dirProvider, extensionIdToIgnoreForLiveDependent, dotnetInstall);
        return hasNoRegisteredDependents && hasNoLiveDependentsBesidesExtensionToIgnore;
    }

    /**
     *
     * @param dotnetInstall the install to check the dependents of
     * @param dirProvider used to resolve the directory of the installation
     * @param allowUninstallUserOnlyInstall whether we should consider the user as dependent on an install
     * @returns true if there are no registered dependents. a registered dependent is one that requested the installation and tried to install it.
     * A dependent may exist even if they didn't ask to install the install - e.g. a path setting or hard-coded PATH value may exist.
     * A registered dependent may also no longer actually depend on the install. Many extensions who request an install do not properly notify when they are done with said install.
     */
    public async installHasNoRegisteredDependentsBesidesId(dotnetInstall: DotnetInstall, dirProvider: IInstallationDirectoryProvider, allowUninstallUserOnlyInstall = false, dependentToIgnoreId: string): Promise<boolean>
    {
        return executeWithLock(this.eventStream, false, this.getLockFilePathForKey(dirProvider, 'installed'), 5, 200000,
            async (installationState: InstallState, install: DotnetInstall) =>
            {
                this.eventStream.post(new RemovingVersionFromExtensionState(`Removing ${JSON.stringify(install)} with id ${installationState} from the state.`));
                const existingInstalls = await this.getExistingInstalls(dirProvider, true);
                const installRecord = existingInstalls.filter(x => IsEquivalentInstallation(x.dotnetInstall, install));

                const zeroInstalledRecordsLeft = (installRecord?.length ?? 0) === 0;
                // Assumption: no duplicate records could exist ( should hold true )
                const onlyRecordLeftShouldBeIgnored = (installRecord?.length ?? 0) === 1 && (installRecord[0]?.installingExtensions?.length ?? 0) === 1 && (installRecord[0]?.installingExtensions?.[0] === dependentToIgnoreId);
                const zeroRelevantRecordsLeft = zeroInstalledRecordsLeft || onlyRecordLeftShouldBeIgnored;

                const installedRecordsLeftButNoOwnersRemain = (installRecord[0]?.installingExtensions?.length ?? 0) === 0;
                const installWasMadeByUserAndHasNoExtensionDependencies = (allowUninstallUserOnlyInstall &&
                    (installRecord[0]?.installingExtensions?.length ?? 0) === 1 && installRecord[0]?.installingExtensions?.includes('user'));

                return zeroRelevantRecordsLeft || installedRecordsLeftButNoOwnersRemain || installWasMadeByUserAndHasNoExtensionDependencies;
            }, 'installed', dotnetInstall);
    }

    protected async reportSuccessfulUninstallHelper(context: IAcquisitionWorkerContext, installIdObj: DotnetInstall, forceUninstall = false, alreadyHoldingLock = false)
    {
        return executeWithLock(this.eventStream, alreadyHoldingLock, this.getLockFilePathForKey(context.installDirectoryProvider, 'installed'), 5, 200000,
            async (installState: InstallState, install: DotnetInstall, ctx: IAcquisitionWorkerContext) =>
            {
                this.eventStream.post(new RemovingVersionFromExtensionState(`After Uninstallation, Removing ${JSON.stringify(install)} with id ${installState} from the state.`));
                const existingInstalls = await this.getExistingInstalls(ctx.installDirectoryProvider, true);

                // Assumption: If we are called correctly, there are no more references/extensions that depend on this install, so remove the install from the list entirely.
                this.eventStream.post(new RemovingExtensionFromList(forceUninstall ? `At the request of ${ctx.acquisitionContext?.requestingExtensionId}, we force uninstalled ${JSON.stringify(install)}.` :
                    `The last owner ${ctx.acquisitionContext?.requestingExtensionId} removed ${JSON.stringify(install)} entirely from the state.`));
                await this.extensionState.update(installState, existingInstalls.filter(x => !IsEquivalentInstallation(x.dotnetInstall, install)));
            }, 'installed', installIdObj, context);
    }

    public async reportSuccessfulUninstall(context: IAcquisitionWorkerContext, installIdObj: DotnetInstall, forceUninstall = false)
    {
        return this.reportSuccessfulUninstallHelper(context, installIdObj, forceUninstall, false);
    }

    public async uninstallAllRecords(provider: IInstallationDirectoryProvider, deletionFunction: () => Promise<void>): Promise<void>
    {
        return executeWithLock(this.eventStream, false, this.getLockFilePathForKey(provider, 'installed'), 5, 200000,
            async () =>
            {
                const installedVersions = await this.getExistingInstalls(provider, true);
                const remainingInstalledVersions = installedVersions.filter(x => x.dotnetInstall.isGlobal);
                await this.extensionState.update('installed', remainingInstalledVersions);
                await deletionFunction();
            },);
    }


    private getLockFilePathForKeySimple(dataKey: string): string
    {
        return `${dataKey}Lk`;
    }

    private getLockFilePathForKey(provider: IInstallationDirectoryProvider, dataKey: string): string
    {
        return this.getLockFilePathForKeySimple(dataKey);
    }

    public async addOwners(install: DotnetInstall, ownersToAdd: (string | null)[], dirProvider: IInstallationDirectoryProvider): Promise<void>
    {
        await executeWithLock(this.eventStream, false, this.getLockFilePathForKey(dirProvider, 'installed'), 5, 200000,
            async () =>
            {
                const existingInstalls = await this.getExistingInstalls(dirProvider, true);
                const idx = existingInstalls.findIndex(x => IsEquivalentInstallation(x.dotnetInstall, install));
                if (idx !== -1)
                {
                    const installRecord: InstallRecord = existingInstalls[idx];
                    const ownerSet = new Set(installRecord.installingExtensions);
                    for (const owner of ownersToAdd)
                    {
                        if (owner)
                        {
                            ownerSet.add(owner);
                        }
                    }
                    installRecord.installingExtensions = Array.from(ownerSet) as InstallOwner[];
                    existingInstalls[idx] = installRecord;

                    this.eventStream.post(new AddTrackingVersions(`Adding owners ${ownersToAdd.join(', ')} to existing install record ${JSON.stringify(InstallToStrings(install))}`));
                    await this.extensionState.update('installed', existingInstalls);
                }
            });
    }

    /**
     *
     * @param getAlreadyInstalledVersions - Whether to get the versions that are already installed. If true, gets installed, if false, gets what's still being installed / installing.
     */
    public async getExistingInstalls(dirProvider: IInstallationDirectoryProvider, alreadyHoldingLock = false): Promise<InstallRecord[]>
    {
        return executeWithLock(this.eventStream, alreadyHoldingLock, this.getLockFilePathForKey(dirProvider, 'installed'),
            5, 200000, async (installState: InstallState) =>
        {
            const existingInstalls = this.extensionState.get<InstallRecordOrStr[]>(installState, []);
            const convertedInstalls: InstallRecord[] = [];

            existingInstalls.forEach((install: InstallRecordOrStr) =>
            {
                if (typeof install === 'string')
                {
                    this.eventStream.post(new ConvertingLegacyInstallRecord(`Converting legacy install record ${install} to a null owner.Assuming:
                        ${JSON.stringify(InstallToStrings(getAssumedInstallInfo(install, null)))}`));
                    convertedInstalls.push(
                        {
                            dotnetInstall: getAssumedInstallInfo(install, null),
                            installingExtensions: [null],
                        } as InstallRecord
                    );
                }
                else if (install.dotnetInstall.hasOwnProperty('installKey'))
                {
                    convertedInstalls.push(
                        {
                            dotnetInstall: {
                                installId: (install.dotnetInstall as DotnetInstallWithKey).installKey,
                                version: install.dotnetInstall.version,
                                architecture: install.dotnetInstall.architecture,
                                isGlobal: install.dotnetInstall.isGlobal,
                                installMode: install.dotnetInstall.installMode
                            } as DotnetInstall,
                            installingExtensions: install.installingExtensions,
                        } as InstallRecord
                    )
                }
                else if (!install.dotnetInstall.hasOwnProperty('installId') && !install.dotnetInstall.hasOwnProperty('installKey'))
                {
                    ; // This is a corrupted install which was cast to the incorrect type. We can install on top of it without causing a problem, lets get rid of this record.
                }
                else
                {
                    const owners = Array.isArray(install.installingExtensions) ? install.installingExtensions : [];
                    convertedInstalls.push(
                        {
                            dotnetInstall: install.dotnetInstall,
                            installingExtensions: owners
                        } as InstallRecord
                    );
                }
            });

            await this.extensionState.update(installState, convertedInstalls);

            this.eventStream.post(new FoundTrackingVersions(`${installState} :
                        ${convertedInstalls.map(x => `${JSON.stringify(x.dotnetInstall)} owned by ${x.installingExtensions.map(owner => owner ?? 'null').join(', ')}\n`)}`));
            return convertedInstalls;
        }, 'installed');
    }

    public async untrackInstalledVersion(context: IAcquisitionWorkerContext, install: DotnetInstall, force = false)
    {
        await this.removeVersionFromExtensionState(context, install, force);
    }

    protected async removeVersionFromExtensionState(context: IAcquisitionWorkerContext, installIdObj: DotnetInstall, forceUninstall = false)
    {
        return executeWithLock(this.eventStream, false, this.getLockFilePathForKey(context.installDirectoryProvider, 'installed'), 5, 200000,
            async (installState: InstallState, install: DotnetInstall, ctx: IAcquisitionWorkerContext) =>
            {
                this.eventStream.post(new RemovingVersionFromExtensionState(`Removing ${JSON.stringify(install)} with id ${installState} from the state.`));

                const existingInstalls = await this.getExistingInstalls(ctx.installDirectoryProvider, true);
                const installRecord = existingInstalls.filter(x => IsEquivalentInstallation(x.dotnetInstall, install));

                if (installRecord)
                {
                    if ((installRecord?.length ?? 0) > 1)
                    {
                        this.eventStream.post(new DuplicateInstallDetected(`The install ${(JSON.stringify(install))} has a duplicated record ${installRecord.length} times in the extension state.
                        ${installRecord.map(x => `${x.installingExtensions.join(' ')} ${JSON.stringify(InstallToStrings(x.dotnetInstall))}`)} \n`));
                    }

                    const preExistingRecord = installRecord.at(0);
                    const preExistingOwners = preExistingRecord?.installingExtensions ?? [];
                    const owners = preExistingOwners.filter(owner => owner !== ctx.acquisitionContext?.requestingExtensionId);
                    if (forceUninstall)
                    {
                        await this.reportSuccessfulUninstallHelper(context, install, true, true);
                    }
                    else
                    {
                        // There may be other extensions that depend on this install, so merely remove this requesting extension from the list of owners.
                        this.eventStream.post(new RemovingOwnerFromList(`The owner ${ctx.acquisitionContext?.requestingExtensionId} removed ${JSON.stringify(install)} itself from the list, but ${owners.join(', ')} remain.`));
                        await this.extensionState.update(installState, existingInstalls.map(x => IsEquivalentInstallation(x.dotnetInstall, install) ?
                            { dotnetInstall: install, installingExtensions: owners } as InstallRecord : x));
                    }
                }
            }, 'installed', installIdObj, context);
    }

    public async trackInstalledVersion(context: IAcquisitionWorkerContext, install: DotnetInstall, pathToValidate: string)
    {
        await this.addVersionToExtensionState(context, install, pathToValidate);
    }

    /**
     * Marks an install as in use so it doesn't get cleaned up during the running instance of code.
     * @param installDirectory - The install id to mark as in use. This happens automatically when an install is installed, but not when it's returned from the state otherwise.
     */
    public markInstallAsInUse(installExePath: string)
    {
        return this.markInstallAsInUseWithInstallLock(installExePath, false, InstallTrackerSingleton.sessionId);
    }

    protected markInstallAsInUseWithInstallLock(installExePath: string, alreadyHoldingLock: boolean, sessionId: string)
    {
        return executeWithLock(this.eventStream, alreadyHoldingLock, this.getLockFilePathForKeySimple('installed'), 5, 200000,
            async () =>
            {
                const serializedData = this.extensionState.get<Record<string, string[]>>(this.sessionInstallsKey, {});
                const existingSessionsWithUsedExecutablePaths = deserializeMapOfSets<string, string>(serializedData);

                const activeSessionExecutablePaths = existingSessionsWithUsedExecutablePaths.get(sessionId) || new Set<string>();
                activeSessionExecutablePaths.add(installExePath);
                existingSessionsWithUsedExecutablePaths.set(sessionId, activeSessionExecutablePaths);

                const serializedMap = serializeMapOfSets(existingSessionsWithUsedExecutablePaths);
                this.eventStream.post(new MarkedInstallInUse(`Session ${InstallTrackerSingleton.sessionId} marked ${installExePath} as in use.\nSessions: ${JSON.stringify(serializedMap)}`));
                await this.extensionState.update(this.sessionInstallsKey, serializedMap);
                return Promise.resolve();
            });
    }

    protected async addVersionToExtensionState(context: IAcquisitionWorkerContext, installObj: DotnetInstall, pathToValidate: string, alreadyHoldingLock = false)
    {
        return executeWithLock(this.eventStream, alreadyHoldingLock, this.getLockFilePathForKey(context.installDirectoryProvider, 'installed'), 5, 200000,
            async (installationState: InstallState, install: DotnetInstall, ctx: IAcquisitionWorkerContext) =>
            {
                this.eventStream.post(new AddTrackingVersions(`Adding ${JSON.stringify(install)} with id ${installObj.installId} from the state.`));

                // We need to validate again ourselves because uninstallAll can blast away the state but holds on to the installed lock when doing so.
                context.installationValidator.validateDotnetInstall(install, pathToValidate);

                await this.markInstallAsInUseWithInstallLock(pathToValidate, true, InstallTrackerSingleton.sessionId);
                const existingVersions = await this.getExistingInstalls(context.installDirectoryProvider, true);
                const preExistingInstallIndex = existingVersions.findIndex(x => IsEquivalentInstallation(x.dotnetInstall, install));

                if (preExistingInstallIndex !== -1)
                {
                    const existingInstall = existingVersions.find(x => IsEquivalentInstallation(x.dotnetInstall, install));

                    // Did this extension already mark itself as having ownership of this install? If so, we can skip re-adding it.
                    if (!(existingInstall?.installingExtensions?.includes(ctx.acquisitionContext?.requestingExtensionId ?? null)))
                    {
                        this.eventStream.post(new SkipAddingInstallEvent(`Skipped adding ${JSON.stringify(install)} to the state because it was already there with the same owner.`));
                        existingInstall!.installingExtensions.push(ctx.acquisitionContext?.requestingExtensionId ?? null);
                        existingVersions[preExistingInstallIndex] = existingInstall!;
                    }
                }
                else
                {
                    existingVersions.push(
                        {
                            dotnetInstall: install,
                            installingExtensions: [ctx.acquisitionContext?.requestingExtensionId ?? null]
                        } as InstallRecord
                    );
                }

                this.eventStream.post(new AddTrackingVersions(`Updated ${installationState} :
${existingVersions.map(x => `${JSON.stringify(x.dotnetInstall)} owned by ${x.installingExtensions.map(owner => owner ?? 'null').join(', ')}\n`)} `));
                await this.extensionState.update(installationState, existingVersions);
            }, 'installed', installObj, context);
    }
}