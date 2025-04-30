/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
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
    SkipAddingInstallEvent
} from '../EventStream/EventStreamEvents';
import { IExtensionState } from '../IExtensionState';
import { getAssumedInstallInfo } from '../Utils/InstallIdUtilities';
import { executeWithLock } from '../Utils/TypescriptUtilities';
import
{
    DotnetInstall,
    DotnetInstallWithKey,
    InstallToStrings,
    IsEquivalentInstallation
} from './DotnetInstall';
import { IAcquisitionWorkerContext } from './IAcquisitionWorkerContext';
import { IInstallationDirectoryProvider } from './IInstallationDirectoryProvider';
import { InstallRecord, InstallRecordOrStr } from './InstallRecord';

export type InstallState = 'installing' | 'installed';

export class InstallTrackerSingleton
{
    protected static instance: InstallTrackerSingleton;

    protected constructor(protected eventStream: IEventStream, protected extensionState: IExtensionState)
    {
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

    public async canUninstall(dotnetInstall: DotnetInstall, dirProvider: IInstallationDirectoryProvider, allowUninstallUserOnlyInstall = false): Promise<boolean>
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

    private getLockFilePathForKey(provider: IInstallationDirectoryProvider, dataKey: string): string
    {
        return `${dataKey}Lk`;
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

    protected async addVersionToExtensionState(context: IAcquisitionWorkerContext, installObj: DotnetInstall, pathToValidate: string, alreadyHoldingLock = false)
    {
        return executeWithLock(this.eventStream, alreadyHoldingLock, this.getLockFilePathForKey(context.installDirectoryProvider, 'installed'), 5, 200000,
            async (installationState: InstallState, install: DotnetInstall, ctx: IAcquisitionWorkerContext) =>
            {
                this.eventStream.post(new AddTrackingVersions(`Adding ${JSON.stringify(install)} with id ${installObj.installId} from the state.`));

                // We need to validate again ourselves because uninstallAll can blast away the state but holds on to the installed lock when doing so.
                context.installationValidator.validateDotnetInstall(install, pathToValidate);

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