/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { DotnetInstall } from '../../Acquisition/DotnetInstall';
import { IInstallationDirectoryProvider } from '../../Acquisition/IInstallationDirectoryProvider';
import { InstallRecord } from '../../Acquisition/InstallRecord';
import { InstallTrackerSingleton } from '../../Acquisition/InstallTrackerSingleton';
import { IEventStream } from '../../EventStream/EventStream';
import { IExtensionState } from '../../IExtensionState';
import { MockInstallTracker } from './MockObjects';

export class LocalUpdateServiceTestTracker extends MockInstallTracker
{
    private installSequences: InstallRecord[][] = [];
    private ownersAdded: { install: DotnetInstall; owners: (string | null)[] }[] = [];
    private currentInstallSnapshot: InstallRecord[] | undefined;

    protected constructor(eventStream: IEventStream, extensionState: IExtensionState)
    {
        super(eventStream, extensionState);
        this.overrideMembers(eventStream, extensionState);
    }

    public static getInstance(eventStream: IEventStream, extensionState: IExtensionState): LocalUpdateServiceTestTracker
    {
        let instance = (InstallTrackerSingleton as unknown as { instance?: InstallTrackerSingleton }).instance as LocalUpdateServiceTestTracker | undefined;

        if (!instance || !(instance instanceof LocalUpdateServiceTestTracker))
        {
            instance = new LocalUpdateServiceTestTracker(eventStream, extensionState);
            (InstallTrackerSingleton as unknown as { instance: InstallTrackerSingleton }).instance = instance;
        }
        else
        {
            instance.overrideMembers(eventStream, extensionState);
            instance.setExtensionState(extensionState);
        }

        return instance;
    }

    public static async reset(): Promise<void>
    {
        const instance = (InstallTrackerSingleton as unknown as { instance?: InstallTrackerSingleton }).instance as LocalUpdateServiceTestTracker | undefined;

        if (instance)
        {
            instance.installSequences = [];
            instance.ownersAdded = [];
            instance.currentInstallSnapshot = undefined;
            await instance.endAnySingletonTrackingSessions();
        }

        (InstallTrackerSingleton as unknown as { instance?: InstallTrackerSingleton }).instance = undefined;
    }

    public setInstallSequences(sequences: InstallRecord[][]): void
    {
        this.installSequences = sequences.map(sequence => sequence.map(record =>
        {
            return {
                dotnetInstall: { ...record.dotnetInstall },
                installingExtensions: [...record.installingExtensions]
            } as InstallRecord;
        }));
        this.currentInstallSnapshot = undefined;
    }

    public async getExistingInstalls(dirProvider: IInstallationDirectoryProvider, alreadyHoldingLock = false): Promise<InstallRecord[]>
    {
        if (!alreadyHoldingLock)
        {
            if (this.installSequences.length > 0)
            {
                this.currentInstallSnapshot = this.installSequences.shift()!;
            }
        }

        if (!this.currentInstallSnapshot)
        {
            return [];
        }

        return this.currentInstallSnapshot.map(record =>
        {
            return {
                dotnetInstall: { ...record.dotnetInstall },
                installingExtensions: [...record.installingExtensions]
            } as InstallRecord;
        });
    }

    public async addOwners(install: DotnetInstall, ownersToAdd: (string | null)[], dirProvider: IInstallationDirectoryProvider): Promise<void>
    {
        this.ownersAdded.push({ install, owners: ownersToAdd });
        await super.addOwners(install, ownersToAdd, dirProvider);
    }

    public getOwnersAdded(): { install: DotnetInstall; owners: (string | null)[] }[]
    {
        return this.ownersAdded;
    }
}
