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
    ConvertingLegacyInstallRecord,
    DuplicateInstallDetected,
    FoundTrackingVersions,
    RemovingExtensionFromList,
    RemovingOwnerFromList,
    RemovingVersionFromExtensionState,
    SessionMutexAcquired,
    SessionMutexAcquisitionFailed,
    SkipAddingInstallEvent
} from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';
import { EventStreamNodeIPCMutexLoggerWrapper } from '../Utils/EventStreamNodeIPCMutexWrapper';
import { getAssumedInstallInfo } from '../Utils/InstallIdUtilities';
import { NodeIPCMutex } from '../Utils/NodeIPCMutex';
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
    protected sessionId: string;

    protected sessionInstallsKey = 'dotnet.returnedInstallDirectories';

    protected constructor(protected eventStream: IEventStream, protected extensionState: IExtensionState)
    {
        const hash = crypto.createHash('sha256');
        hash.update(process.pid.toString());
        this.sessionId = hash.digest('hex').slice(0, 10);
        this.acquirePermanentSessionMutex();
    }

    /**
     * Acquires a mutex associated with the current session and holds it for the lifetime
     * of the process without blocking any threads.
     *
     * This is used to indicate that this session is still alive to other processes
     * that may want to check if installations from this session are still in use.
     */
    private acquirePermanentSessionMutex(): void
    {
        const logger = new EventStreamNodeIPCMutexLoggerWrapper(this.eventStream, this.sessionId);
        const mutex = new NodeIPCMutex(this.sessionId, logger, '');

        // Fire and forget - we don't need to await this
        mutex.acquire(async () =>
        {
            return new Promise<void>(() =>
            {
                // Intentionally not calling resolve/reject so we never release
                this.eventStream.post(new SessionMutexAcquired(`Session ${this.sessionId} has acquired its permanent mutex`));
            });
        }, 10, 100, `${this.sessionId}-permanent`).catch((error) =>
        {
            this.eventStream.post(new SessionMutexAcquisitionFailed(`Failed to acquire permanent mutex for session ${this.sessionId}: ${error}`));
        });
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
     *
     * @param installExePath the full path to the dotnet executable of the install to check
     * @returns Whether an install has a 'live' dependent. In other words, if we have returned this executable to a process to use.
     * In addition, we check whether the user has set the PATH to a local install, in case we never return it but the user relies on it externally.
     */
    public async installHasNoLiveDependents(installExePath: string): Promise<boolean>
    {
        // We might be able to use a separate lock for just the returnedInstallDirectories, but for simplicity, we'll use the same lock as installed.
        return executeWithLock(this.eventStream, false, this.getLockFilePathForKeySimple('installed'), 5, 200000,
            async () =>
            {
                const existingSessionsWithUsedExecutablePaths = this.extensionState.get<SessionsWithInUseExecutables>(this.sessionInstallsKey, new Map<string, Set<string>>());
                for (const [sessionId, exePaths] of existingSessionsWithUsedExecutablePaths)
                {
                    if (exePaths.has(installExePath))
                    {
                        if (sessionId === this.sessionId)
                        {
                            return false; // Our session must be live if this code is running.
                        }

                        // See if the session is still 'live' - there is no way to ensure we remove it on exit/os crash
                        const logger = new EventStreamNodeIPCMutexLoggerWrapper(this.eventStream, sessionId);
                        const mutex = new NodeIPCMutex(sessionId, logger, ``);


                        const shouldContinue = await mutex.acquire(async () =>
                        {
                            // eslint-disable-next-line no-return-await
                            existingSessionsWithUsedExecutablePaths.delete(sessionId);
                            this.extensionState.update(this.sessionInstallsKey, existingSessionsWithUsedExecutablePaths);
                            return true;
                        }, 10, 20, `${sessionId}-${crypto.randomUUID()}`).catch(() => { return false; });
                        if (!shouldContinue)
                        {
                            return false;
                        }
                    }
                }
                // If the user hard-coded their PATH to include the vscode extension install (not a good practice), we likely don't want to uninstall it.
                return !(
                    (process.env.PATH?.includes(path.dirname(installExePath)) ?? false) ||
                    (process.env.DOTNET_ROOT?.includes(path.dirname(installExePath)) ?? false)
                );
            });
    }

    public async installHasNoDependents(dotnetInstall: DotnetInstall, dirProvider: IInstallationDirectoryProvider, allowUninstallUserOnlyInstall = false): Promise<boolean>
    {
        const hasRegisteredDependents = await this.installHasNoRegisteredDependents(dotnetInstall, dirProvider, allowUninstallUserOnlyInstall);
        const hasLiveDependents = await this.installHasNoLiveDependents(path.join(dirProvider.getInstallDir(dotnetInstall.installId), getDotnetExecutable()));
        return !hasRegisteredDependents && !hasLiveDependents;
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
    public async installHasNoRegisteredDependents(dotnetInstall: DotnetInstall, dirProvider: IInstallationDirectoryProvider, allowUninstallUserOnlyInstall = false): Promise<boolean>
    {
        return executeWithLock(this.eventStream, false, this.getLockFilePathForKey(dirProvider, 'installed'), 5, 200000,
            async (installationState: InstallState, install: DotnetInstall) =>
            {
                this.eventStream.post(new RemovingVersionFromExtensionState(`Removing ${JSON.stringify(install)} with id ${installationState} from the state.`));
                const existingInstalls = await this.getExistingInstalls(dirProvider, true);
                const installRecord = existingInstalls.filter(x => IsEquivalentInstallation(x.dotnetInstall, install));

                const zeroInstalledRecordsLeft = (installRecord?.length ?? 0) === 0;
                const installedRecordsLeftButNoOwnersRemain = installRecord[0]?.installingExtensions?.length === 0;
                const installWasMadeByUserAndHasNoExtensionDependencies = (allowUninstallUserOnlyInstall &&
                    installRecord[0]?.installingExtensions?.length === 1 && installRecord[0]?.installingExtensions?.includes('user'));

                return zeroInstalledRecordsLeft || installedRecordsLeftButNoOwnersRemain || installWasMadeByUserAndHasNoExtensionDependencies;
            }, 'installed', dotnetInstall);
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
                        if (owner && !ownerSet.has(owner))
                        {
                            ownerSet.add(owner);
                        }
                    }
                    installRecord.installingExtensions = Array.from(ownerSet) as InstallOwner[];
                    existingInstalls[idx] = installRecord;
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
            5, 200000, (installState: InstallState) =>
        {
            const existingInstalls = this.extensionState.get<InstallRecordOrStr[]>(installState, []);
            const convertedInstalls: InstallRecord[] = [];

            existingInstalls.forEach((install: InstallRecordOrStr) =>
            {
                if (typeof install === 'string')
                {
                    this.eventStream.post(new ConvertingLegacyInstallRecord(`Converting legacy install record ${install} to a null owner. Assuming:
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
                    convertedInstalls.push(install as InstallRecord);
                }
            });

            this.extensionState.update(installState, convertedInstalls);

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
${installRecord.map(x => `${x.installingExtensions.join(' ')} ${JSON.stringify(InstallToStrings(x.dotnetInstall))}`)}\n`));
                    }

                    const preExistingRecord = installRecord.at(0);
                    const owners = preExistingRecord?.installingExtensions.filter(x => x !== ctx.acquisitionContext?.requestingExtensionId);
                    if (forceUninstall || (owners?.length ?? 0) < 1)
                    {
                        // There are no more references/extensions that depend on this install, so remove the install from the list entirely.
                        // For installing versions, there should only ever be 1 owner.
                        // For installed versions, there can be N owners.
                        this.eventStream.post(new RemovingExtensionFromList(forceUninstall ? `At the request of ${ctx.acquisitionContext?.requestingExtensionId}, we force uninstalled ${JSON.stringify(install)}.` :
                            `The last owner ${ctx.acquisitionContext?.requestingExtensionId} removed ${JSON.stringify(install)} entirely from the state.`));
                        await this.extensionState.update(installState, existingInstalls.filter(x => !IsEquivalentInstallation(x.dotnetInstall, install)));
                    }
                    else
                    {
                        // There are still other extensions that depend on this install, so merely remove this requesting extension from the list of owners.
                        this.eventStream.post(new RemovingOwnerFromList(`The owner ${ctx.acquisitionContext?.requestingExtensionId} removed ${JSON.stringify(install)} itself from the list, but ${owners?.join(', ')} remain.`));
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
        return this.markInstallAsInUseWithInstallLock(installExePath, false);
    }

    private markInstallAsInUseWithInstallLock(installExePath: string, alreadyHoldingLock: boolean)
    {
        return executeWithLock(this.eventStream, alreadyHoldingLock, this.getLockFilePathForKeySimple('installed'), 5, 200000,
            async () =>
            {
                const existingSessionsWithUsedExecutablePaths = this.extensionState.get<SessionsWithInUseExecutables>(this.sessionInstallsKey, new Map<string, Set<string>>());
                const activeSessionExecutablePaths = existingSessionsWithUsedExecutablePaths.get(this.sessionId) || new Set();
                activeSessionExecutablePaths.add(installExePath);
                existingSessionsWithUsedExecutablePaths.set(this.sessionId, activeSessionExecutablePaths);
                this.extensionState.update(this.sessionInstallsKey, existingSessionsWithUsedExecutablePaths);
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

                this.markInstallAsInUseWithInstallLock(pathToValidate, true);
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
${existingVersions.map(x => `${JSON.stringify(x.dotnetInstall)} owned by ${x.installingExtensions.map(owner => owner ?? 'null').join(', ')}\n`)}`));
                await this.extensionState.update(installationState, existingVersions);
            }, 'installed', installObj, context);
    }
}