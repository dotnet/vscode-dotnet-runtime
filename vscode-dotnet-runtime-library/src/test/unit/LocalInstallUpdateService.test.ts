/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { assert } from 'chai';
import * as path from 'path';
import { DotnetCoreAcquisitionWorker } from '../../Acquisition/DotnetCoreAcquisitionWorker';
import { DotnetInstall } from '../../Acquisition/DotnetInstall';
import { IInstallationDirectoryProvider } from '../../Acquisition/IInstallationDirectoryProvider';
import { InstallRecord } from '../../Acquisition/InstallRecord';
import { InstallTrackerSingleton } from '../../Acquisition/InstallTrackerSingleton';
import { LocalInstallUpdateService } from '../../Acquisition/LocalInstallUpdateService';
import { IEventStream } from '../../EventStream/EventStream';
import { SkippingIncompatibleArchitectureInstall } from '../../EventStream/EventStreamEvents';
import { IDotnetAcquireContext } from '../../IDotnetAcquireContext';
import { IExtensionState } from '../../IExtensionState';
import { getDotnetExecutable } from '../../Utils/TypescriptUtilities';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { LocalUpdateServiceTestTracker } from '../mocks/LocalInstallUpdateServiceMocks';
import { MockEventStream, MockExtensionContext, MockInstallTracker, MockLoggingObserver } from '../mocks/MockObjects';
import { getMockAcquisitionContext } from './TestUtility';

class RealLocalUpdateServiceTracker extends MockInstallTracker
{
    protected constructor(eventStream: IEventStream, extensionState: IExtensionState)
    {
        super(eventStream, extensionState);
        this.overrideMembers(eventStream, extensionState);
    }

    public static getInstance(eventStream: IEventStream, extensionState: IExtensionState): RealLocalUpdateServiceTracker
    {
        let instance = (InstallTrackerSingleton as unknown as { instance?: InstallTrackerSingleton }).instance as RealLocalUpdateServiceTracker | undefined;

        if (!instance || !(instance instanceof RealLocalUpdateServiceTracker))
        {
            instance = new RealLocalUpdateServiceTracker(eventStream, extensionState);
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
        const rawInstance = (InstallTrackerSingleton as unknown as { instance?: InstallTrackerSingleton }).instance;
        if (rawInstance && rawInstance instanceof RealLocalUpdateServiceTracker)
        {
            await rawInstance.endAnySingletonTrackingSessions();
            (InstallTrackerSingleton as unknown as { instance?: InstallTrackerSingleton }).instance = undefined;
        }
    }
}

class TestInstallationDirectoryProvider extends IInstallationDirectoryProvider
{
    constructor(storagePath: string)
    {
        super(storagePath);
    }

    public getInstallDir(installId: string): string
    {
        return path.join(this.getStoragePath(), installId);
    }
}

function createInstallRecord(version: string, architecture: string, installMode: 'runtime' | 'sdk' | 'aspnetcore', owners: (string | null)[], isGlobal = false): InstallRecord
{
    return {
        dotnetInstall: {
            version,
            architecture,
            installId: `${version}~${architecture}~${installMode}${isGlobal ? '~global' : ''}`,
            installMode,
            isGlobal
        },
        installingExtensions: owners
    };
}

suite('LocalInstallUpdateService Unit Tests', function ()
{
    const originalGetInstance = WebRequestWorkerSingleton.getInstance;

    this.afterEach(async () =>
    {
        (WebRequestWorkerSingleton as unknown as { getInstance: () => WebRequestWorkerSingleton }).getInstance = originalGetInstance;
        await RealLocalUpdateServiceTracker.reset();
        await LocalUpdateServiceTestTracker.reset();
    });

    test('It acquires latest install and uninstalls outdated versions', async () =>
    {
        const onlineStub = {
            isOnline: async () => true
        } as unknown as WebRequestWorkerSingleton;

        (WebRequestWorkerSingleton as unknown as { getInstance: () => WebRequestWorkerSingleton }).getInstance = () => onlineStub;

        const eventStream = new MockEventStream();
        const extensionState = new MockExtensionContext();
        extensionState.update('dotnet.latestUpdateDate', new Date(0));

        const directoryProvider = new TestInstallationDirectoryProvider('/tmp');

        const currentArch = DotnetCoreAcquisitionWorker.defaultArchitecture();
        const owners = ['sample-owner'];
        const legacyInstall: InstallRecord = {
            dotnetInstall: {
                version: '6.0.100',
                architecture: currentArch,
                installId: `6.0.100~${currentArch}`,
                installMode: 'runtime',
                isGlobal: false
            },
            installingExtensions: owners
        };
        const updatedInstall: InstallRecord = {
            dotnetInstall: {
                version: '6.0.120',
                architecture: currentArch,
                installId: `6.0.120~${currentArch}`,
                installMode: 'runtime',
                isGlobal: false
            },
            installingExtensions: owners
        };

        const trackerInstance = LocalUpdateServiceTestTracker.getInstance(eventStream, extensionState);
        trackerInstance.setInstallSequences([[legacyInstall], [legacyInstall, updatedInstall]]);

        let acquireContext: IDotnetAcquireContext | undefined;
        const acquireStub = async (context: IDotnetAcquireContext) =>
        {
            acquireContext = context;
            return undefined;
        };

        const uninstallContexts: IDotnetAcquireContext[] = [];
        const uninstallStub = async (context: IDotnetAcquireContext) =>
        {
            uninstallContexts.push(context);
            return '0';
        };

        const updateService = new LocalInstallUpdateService(eventStream, extensionState, directoryProvider, acquireStub, uninstallStub, new MockLoggingObserver(), LocalUpdateServiceTestTracker);

        await updateService.ManageInstalls(0);

        assert.isDefined(acquireContext, 'Acquire should be invoked for the major.minor version');
        assert.strictEqual(acquireContext!.version, '6.0');
        assert.isTrue(acquireContext!.forceUpdate, 'Acquire should request a forced update');
        assert.strictEqual(acquireContext!.mode, 'runtime');

        assert.lengthOf(uninstallContexts, 1, 'Exactly one outdated install should be scheduled for uninstall');
        assert.strictEqual(uninstallContexts[0].version, legacyInstall.dotnetInstall.version);
        assert.isUndefined(uninstallContexts[0].forceUpdate, 'Uninstall contexts should not set the forceUpdate flag');

        const ownersAdded = trackerInstance.getOwnersAdded();
        assert.lengthOf(ownersAdded, 1, 'Owners should be transferred to the latest install');
        assert.deepEqual(ownersAdded[0].owners, owners, 'Existing owners should be preserved on upgrade');
        assert.strictEqual(ownersAdded[0].install.installId, updatedInstall.dotnetInstall.installId, 'Latest install should receive owners');
    });

    test('It removes outdated installs when using the real tracker implementation', async () =>
    {
        const onlineStub = {
            isOnline: async () => true
        } as unknown as WebRequestWorkerSingleton;

        (WebRequestWorkerSingleton as unknown as { getInstance: () => WebRequestWorkerSingleton }).getInstance = () => onlineStub;

        const eventStream = new MockEventStream();
        const extensionState = new MockExtensionContext();
        extensionState.update('dotnet.latestUpdateDate', new Date(0));

        const directoryProvider = new TestInstallationDirectoryProvider('/tmp');

        const legacyInstall = createInstallRecord('6.0.100', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', ['owner-real']);
        const latestInstall = createInstallRecord('6.0.150', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', []);

        extensionState.update('installed', [legacyInstall]);

        const tracker = RealLocalUpdateServiceTracker.getInstance(eventStream, extensionState);

        const acquireStub = async (context: IDotnetAcquireContext) =>
        {
            const workerContext = getMockAcquisitionContext(context.mode ?? 'runtime', latestInstall.dotnetInstall.version, 5000, eventStream, extensionState, context.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture(), directoryProvider);
            workerContext.acquisitionContext.requestingExtensionId = context.requestingExtensionId;

            const installPath = path.join(directoryProvider.getInstallDir(latestInstall.dotnetInstall.installId), getDotnetExecutable());
            await tracker.trackInstalledVersion(workerContext, latestInstall.dotnetInstall, installPath);
            return undefined;
        };

        const uninstallStub = async (context: IDotnetAcquireContext, force: boolean, onlyCheckLiveDependents: boolean) =>
        {
            const uninstallTracker = RealLocalUpdateServiceTracker.getInstance(eventStream, extensionState);
            const architecture = context.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture();
            const dotnetInstall: DotnetInstall = {
                version: context.version!,
                architecture,
                installId: `${context.version}~${architecture}~${context.mode}`,
                installMode: context.mode!,
                isGlobal: false
            };

            const workerContext = getMockAcquisitionContext(context.mode ?? 'runtime', context.version!, 5000, eventStream, extensionState, architecture, directoryProvider);
            workerContext.acquisitionContext.requestingExtensionId = context.requestingExtensionId;

            const installExePath = path.join(directoryProvider.getInstallDir(dotnetInstall.installId), getDotnetExecutable());

            await uninstallTracker.untrackInstalledVersion(workerContext, dotnetInstall, force);

            const noDependents = force ? true : onlyCheckLiveDependents ?
                await uninstallTracker.installHasNoLiveDependentsBesidesId(installExePath, directoryProvider, context.requestingExtensionId ?? '', dotnetInstall) :
                await uninstallTracker.installHasNoRegisteredDependentsBesidesId(dotnetInstall, directoryProvider, false, context.requestingExtensionId ?? '');

            if (force || noDependents)
            {
                await uninstallTracker.reportSuccessfulUninstall(workerContext, dotnetInstall, force);
            }

            return '0';
        };

        const updateService = new LocalInstallUpdateService(eventStream, extensionState, directoryProvider, acquireStub, uninstallStub, new MockLoggingObserver(), RealLocalUpdateServiceTracker);

        await updateService.ManageInstalls(0);

        const remainingInstalls = await tracker.getExistingInstalls(directoryProvider, false);
        assert.deepEqual(remainingInstalls.map(install => install.dotnetInstall.installId), [latestInstall.dotnetInstall.installId], 'Only the latest install should remain after cleanup');
        const latestOwners = remainingInstalls[0]?.installingExtensions ?? [];
        assert.include(latestOwners, 'owner-real', 'Owners should transfer to the latest install when using the real tracker');
    }).timeout(10000);

    test('It does not set forceUpdate on uninstall contexts', async () =>
    {
        const onlineStub = {
            isOnline: async () => true
        } as unknown as WebRequestWorkerSingleton;

        (WebRequestWorkerSingleton as unknown as { getInstance: () => WebRequestWorkerSingleton }).getInstance = () => onlineStub;

        const eventStream = new MockEventStream();
        const extensionState = new MockExtensionContext();
        extensionState.update('dotnet.latestUpdateDate', new Date(0));

        const directoryProvider = new TestInstallationDirectoryProvider('/tmp');

        const legacyInstall = createInstallRecord('6.0.100', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', ['owner-a']);
        const latestInstall = createInstallRecord('6.0.150', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', []);

        const trackerInstance = LocalUpdateServiceTestTracker.getInstance(eventStream, extensionState);
        trackerInstance.setInstallSequences([[legacyInstall], [legacyInstall, latestInstall]]);

        const acquireStub = async () => undefined;

        const uninstallContexts: IDotnetAcquireContext[] = [];
        const uninstallStub = async (context: IDotnetAcquireContext) =>
        {
            uninstallContexts.push({ ...context });
            return '0';
        };

        const updateService = new LocalInstallUpdateService(eventStream, extensionState, directoryProvider, acquireStub, uninstallStub, new MockLoggingObserver(), LocalUpdateServiceTestTracker);

        await updateService.ManageInstalls(0);

        assert.isAbove(uninstallContexts.length, 0, 'An outdated install should be scheduled for uninstall');
        assert.isTrue(uninstallContexts.every(context => context.forceUpdate === undefined), 'Uninstall contexts must not set forceUpdate');
    });

    test('It updates each install group independently and preserves non-user owners', async () =>
    {
        const onlineStub = {
            isOnline: async () => true
        } as unknown as WebRequestWorkerSingleton;

        (WebRequestWorkerSingleton as unknown as { getInstance: () => WebRequestWorkerSingleton }).getInstance = () => onlineStub;

        const eventStream = new MockEventStream();
        const extensionState = new MockExtensionContext();
        extensionState.update('dotnet.latestUpdateDate', new Date(0));

        const directoryProvider = new TestInstallationDirectoryProvider('/tmp');

        const currentArch = DotnetCoreAcquisitionWorker.defaultArchitecture();
        const group1OwnersA: (string | null)[] = ['owner-a', 'user'];
        const group1OwnersB: (string | null)[] = ['owner-b'];
        const group2Owners: (string | null)[] = ['owner-c', null, 'user'];

        // Both groups use the current architecture so that they are eligible for auto-update.
        // Two different major.minor versions are used so they form distinct groups.
        const legacyGroup1Oldest = createInstallRecord('6.0.100', currentArch, 'runtime', group1OwnersA);
        const legacyGroup1Older = createInstallRecord('6.0.110', currentArch, 'runtime', group1OwnersB);
        const latestGroup1 = createInstallRecord('6.0.150', currentArch, 'runtime', []);

        const legacyGroup2 = createInstallRecord('7.0.150', currentArch, 'runtime', group2Owners);
        const latestGroup2 = createInstallRecord('7.0.180', currentArch, 'runtime', []);

        const trackerInstance = LocalUpdateServiceTestTracker.getInstance(eventStream, extensionState);
        trackerInstance.setInstallSequences([
            [legacyGroup1Oldest, legacyGroup1Older, legacyGroup2],
            [legacyGroup1Oldest, legacyGroup1Older, latestGroup1, legacyGroup2],
            [legacyGroup1Older, latestGroup1, legacyGroup2, latestGroup2]
        ]);

        const acquireContexts: IDotnetAcquireContext[] = [];
        const acquireStub = async (context: IDotnetAcquireContext) =>
        {
            acquireContexts.push({ ...context });
            return undefined;
        };

        const uninstallContexts: IDotnetAcquireContext[] = [];
        const uninstallStub = async (context: IDotnetAcquireContext) =>
        {
            uninstallContexts.push({ ...context });
            return '0';
        };

        const updateService = new LocalInstallUpdateService(eventStream, extensionState, directoryProvider, acquireStub, uninstallStub, new MockLoggingObserver(), LocalUpdateServiceTestTracker);

        await updateService.ManageInstalls(0);

        assert.deepEqual(acquireContexts.map(c => c.version), ['6.0', '7.0'], 'Acquire should run separately for each install group');

        assert.lengthOf(uninstallContexts, 3, 'All outdated installs across groups should be scheduled for uninstall');
        assert.sameMembers(uninstallContexts.map(c => c.version!), ['6.0.100', '6.0.110', '7.0.150'], 'Only legacy installs should be uninstalled');

        const ownersAdded = trackerInstance.getOwnersAdded();
        assert.lengthOf(ownersAdded, 2, 'Each group should update owners on the latest install');

        const group1OwnersAdded = ownersAdded.find(entry => entry.install.installId === latestGroup1.dotnetInstall.installId);
        assert.isDefined(group1OwnersAdded, 'Latest group 1 install should receive owners');
        assert.sameMembers(group1OwnersAdded!.owners.filter((owner): owner is string => owner !== null), ['owner-a', 'owner-b'], 'Group 1 owners should exclude user and deduplicate');

        const group2OwnersAdded = ownersAdded.find(entry => entry.install.installId === latestGroup2.dotnetInstall.installId);
        assert.isDefined(group2OwnersAdded, 'Latest group 2 install should receive owners');
        assert.sameMembers(group2OwnersAdded!.owners.filter((owner): owner is string => owner !== null), ['owner-c'], 'Group 2 owners should exclude null and user owners');
    });

    test('It does not uninstall installs when acquisition fails', async () =>
    {
        const onlineStub = {
            isOnline: async () => true
        } as unknown as WebRequestWorkerSingleton;

        (WebRequestWorkerSingleton as unknown as { getInstance: () => WebRequestWorkerSingleton }).getInstance = () => onlineStub;

        const eventStream = new MockEventStream();
        const extensionState = new MockExtensionContext();
        extensionState.update('dotnet.latestUpdateDate', new Date(0));

        const directoryProvider = new TestInstallationDirectoryProvider('/tmp');

        const legacyInstall = createInstallRecord('6.0.100', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', ['owner-a']);

        const trackerInstance = LocalUpdateServiceTestTracker.getInstance(eventStream, extensionState);
        trackerInstance.setInstallSequences([[legacyInstall], [legacyInstall]]);

        const acquireContexts: IDotnetAcquireContext[] = [];
        const acquireStub = async (context: IDotnetAcquireContext) =>
        {
            acquireContexts.push({ ...context });
            throw new Error('acquire failed');
        };

        const uninstallContexts: IDotnetAcquireContext[] = [];
        const uninstallStub = async (context: IDotnetAcquireContext) =>
        {
            uninstallContexts.push({ ...context });
            return '0';
        };

        const updateService = new LocalInstallUpdateService(eventStream, extensionState, directoryProvider, acquireStub, uninstallStub, new MockLoggingObserver(), LocalUpdateServiceTestTracker);

        let thrownError: Error | undefined;
        try
        {
            await updateService.ManageInstalls(0);
            assert.fail('ManageInstalls should throw when acquisition fails');
        }
        catch (error)
        {
            thrownError = error as Error;
        }

        assert.isDefined(thrownError, 'An error should be surfaced when acquisition fails');
        assert.strictEqual(thrownError!.message, 'acquire failed');
        assert.deepEqual(acquireContexts.map(c => c.version), ['6.0'], 'Acquire should be attempted for the failing group');
        assert.lengthOf(uninstallContexts, 0, 'No uninstall should be attempted when acquisition fails');
        assert.lengthOf(trackerInstance.getOwnersAdded(), 0, 'No owners should be transferred when acquisition fails');
    });

    test('It skips installs with architectures incompatible with the current machine', async () =>
    {
        const onlineStub = {
            isOnline: async () => true
        } as unknown as WebRequestWorkerSingleton;

        (WebRequestWorkerSingleton as unknown as { getInstance: () => WebRequestWorkerSingleton }).getInstance = () => onlineStub;

        const eventStream = new MockEventStream();
        const extensionState = new MockExtensionContext();
        extensionState.update('dotnet.latestUpdateDate', new Date(0));

        const directoryProvider = new TestInstallationDirectoryProvider('/tmp');

        // Use the current machine architecture as the "compatible" arch and a different one as "incompatible".
        const currentArch = DotnetCoreAcquisitionWorker.defaultArchitecture();
        const otherArch = currentArch === 'x64' ? 'arm64' : 'x64';

        const compatibleOwners: (string | null)[] = ['owner-compatible', 'user'];
        const incompatibleOwners: (string | null)[] = ['owner-incompatible'];

        const legacyCompatible = createInstallRecord('6.0.100', currentArch, 'runtime', compatibleOwners);
        const latestCompatible = createInstallRecord('6.0.140', currentArch, 'runtime', []);
        const legacyIncompatible = createInstallRecord('6.0.110', otherArch, 'runtime', incompatibleOwners);

        const trackerInstance = LocalUpdateServiceTestTracker.getInstance(eventStream, extensionState);
        trackerInstance.setInstallSequences([
            [legacyCompatible, legacyIncompatible],
            [legacyCompatible, latestCompatible, legacyIncompatible]
        ]);

        const acquireContexts: IDotnetAcquireContext[] = [];
        const acquireStub = async (context: IDotnetAcquireContext) =>
        {
            acquireContexts.push({ ...context });
            return undefined;
        };

        const uninstallContexts: IDotnetAcquireContext[] = [];
        const uninstallStub = async (context: IDotnetAcquireContext) =>
        {
            uninstallContexts.push({ ...context });
            return '0';
        };

        const updateService = new LocalInstallUpdateService(eventStream, extensionState, directoryProvider, acquireStub, uninstallStub, new MockLoggingObserver(), LocalUpdateServiceTestTracker);

        await updateService.ManageInstalls(0);

        // Only the compatible architecture should be acquired/updated
        assert.lengthOf(acquireContexts, 1, 'Acquire should only run for the compatible architecture group');
        assert.strictEqual(acquireContexts[0].architecture, currentArch, 'Only the current architecture should be updated');

        // Only the outdated compatible-arch install should be uninstalled
        assert.lengthOf(uninstallContexts, 1, 'Only the outdated compatible-arch install should be scheduled for uninstall');
        assert.strictEqual(uninstallContexts[0].architecture, currentArch, 'Uninstall should only target the current architecture');

        // The incompatible-arch install should have triggered a skip event
        const skipEvents = eventStream.events.filter(e => e instanceof SkippingIncompatibleArchitectureInstall);
        assert.isAbove(skipEvents.length, 0, 'A skip event should be emitted for the incompatible architecture install');
    });

    test('It forces updates immediately when delay is zero and refreshes the last update timestamp', async () =>
    {
        const onlineStub = {
            isOnline: async () => true
        } as unknown as WebRequestWorkerSingleton;

        (WebRequestWorkerSingleton as unknown as { getInstance: () => WebRequestWorkerSingleton }).getInstance = () => onlineStub;

        const eventStream = new MockEventStream();
        const extensionState = new MockExtensionContext();
        const now = new Date();
        extensionState.update('dotnet.latestUpdateDate', now);

        const directoryProvider = new TestInstallationDirectoryProvider('/tmp');

        const owners: (string | null)[] = ['owner-force'];
        const legacyInstall = createInstallRecord('8.0.120', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', owners);
        const latestInstall = createInstallRecord('8.0.180', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', []);

        const trackerInstance = LocalUpdateServiceTestTracker.getInstance(eventStream, extensionState);
        trackerInstance.setInstallSequences([[legacyInstall], [legacyInstall, latestInstall]]);

        const acquireContexts: IDotnetAcquireContext[] = [];
        const acquireStub = async (context: IDotnetAcquireContext) =>
        {
            acquireContexts.push({ ...context });
            return undefined;
        };

        const uninstallContexts: IDotnetAcquireContext[] = [];
        const uninstallStub = async (context: IDotnetAcquireContext) =>
        {
            uninstallContexts.push({ ...context });
            return '0';
        };

        const updateService = new LocalInstallUpdateService(eventStream, extensionState, directoryProvider, acquireStub, uninstallStub, new MockLoggingObserver(), LocalUpdateServiceTestTracker);

        const startTime = Date.now();
        await updateService.ManageInstalls(0);

        assert.lengthOf(acquireContexts, 1, 'Forced updates should trigger acquisition even when the last update was recent');
        assert.strictEqual(acquireContexts[0].version, '8.0', 'Forced acquisition should target the major.minor version');

        assert.lengthOf(uninstallContexts, 1, 'Outdated installs should still be removed during forced updates');
        assert.strictEqual(uninstallContexts[0].version, legacyInstall.dotnetInstall.version, 'The legacy install should be scheduled for uninstall');

        const ownersAdded = trackerInstance.getOwnersAdded();
        assert.lengthOf(ownersAdded, 1, 'Owners should transfer to the latest install during forced updates');
        assert.strictEqual(ownersAdded[0].install.installId, latestInstall.dotnetInstall.installId, 'Latest install should receive the owners');

        const storedLastUpdate = extensionState.get<number | Date>('dotnet.latestUpdateDate', new Date(0));
        const storedTime = new Date(storedLastUpdate as any).getTime();
        assert.isAtLeast(storedTime, startTime, 'Last update timestamp should be refreshed to the current time');
    });

    test('It ignores sdk and global installs when managing runtime updates', async () =>
    {
        const onlineStub = {
            isOnline: async () => true
        } as unknown as WebRequestWorkerSingleton;

        (WebRequestWorkerSingleton as unknown as { getInstance: () => WebRequestWorkerSingleton }).getInstance = () => onlineStub;

        const eventStream = new MockEventStream();
        const extensionState = new MockExtensionContext();
        extensionState.update('dotnet.latestUpdateDate', new Date(0));

        const directoryProvider = new TestInstallationDirectoryProvider('/tmp');

        const sdkInstall = createInstallRecord('8.0.302', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'sdk', ['sdk-owner']);
        const globalRuntime = createInstallRecord('8.0.180', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', ['global-owner'], true);
        const legacyRuntime = createInstallRecord('8.0.150', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', ['runtime-owner']);
        const latestRuntime = createInstallRecord('8.0.190', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', []);

        const trackerInstance = LocalUpdateServiceTestTracker.getInstance(eventStream, extensionState);
        trackerInstance.setInstallSequences([
            [sdkInstall, globalRuntime, legacyRuntime],
            [sdkInstall, globalRuntime, legacyRuntime, latestRuntime]
        ]);

        const acquireContexts: IDotnetAcquireContext[] = [];
        const acquireStub = async (context: IDotnetAcquireContext) =>
        {
            acquireContexts.push({ ...context });
            return undefined;
        };

        const uninstallContexts: IDotnetAcquireContext[] = [];
        const uninstallStub = async (context: IDotnetAcquireContext) =>
        {
            uninstallContexts.push({ ...context });
            return '0';
        };

        const updateService = new LocalInstallUpdateService(eventStream, extensionState, directoryProvider, acquireStub, uninstallStub, new MockLoggingObserver(), LocalUpdateServiceTestTracker);

        await updateService.ManageInstalls(0);

        assert.lengthOf(acquireContexts, 1, 'Only runtime installs should trigger acquisition');
        assert.strictEqual(acquireContexts[0].mode, 'runtime', 'Runtime group should be the only group processed');
        assert.strictEqual(acquireContexts[0].version, '8.0', 'Runtime acquisition should target the major.minor version');

        assert.lengthOf(uninstallContexts, 1, 'Only the outdated runtime install should be scheduled for uninstall');
        assert.deepEqual(uninstallContexts.map(context => context.version), [legacyRuntime.dotnetInstall.version], 'SDK and global installs must not be uninstalled');

        const ownersAdded = trackerInstance.getOwnersAdded();
        assert.lengthOf(ownersAdded, 1, 'Only the newest runtime install should receive owners');
        assert.strictEqual(ownersAdded[0].install.installId, latestRuntime.dotnetInstall.installId, 'Owners should transfer to the latest runtime install only');
    });

    test('It selects the highest runtime patch when patch numbers exceed two digits', async () =>
    {
        const onlineStub = {
            isOnline: async () => true
        } as unknown as WebRequestWorkerSingleton;

        (WebRequestWorkerSingleton as unknown as { getInstance: () => WebRequestWorkerSingleton }).getInstance = () => onlineStub;

        const eventStream = new MockEventStream();
        const extensionState = new MockExtensionContext();
        extensionState.update('dotnet.latestUpdateDate', new Date(0));

        const directoryProvider = new TestInstallationDirectoryProvider('/tmp');

        const owners: (string | null)[] = ['runtime-owner'];
        const legacyInstall = createInstallRecord('8.0.99', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', owners);
        const latestInstall = createInstallRecord('8.0.100', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', []);

        const trackerInstance = LocalUpdateServiceTestTracker.getInstance(eventStream, extensionState);
        trackerInstance.setInstallSequences([[legacyInstall], [legacyInstall, latestInstall]]);

        const acquireContexts: IDotnetAcquireContext[] = [];
        const acquireStub = async (context: IDotnetAcquireContext) =>
        {
            acquireContexts.push({ ...context });
            return undefined;
        };

        const uninstallContexts: IDotnetAcquireContext[] = [];
        const uninstallStub = async (context: IDotnetAcquireContext) =>
        {
            uninstallContexts.push({ ...context });
            return '0';
        };

        const updateService = new LocalInstallUpdateService(eventStream, extensionState, directoryProvider, acquireStub, uninstallStub, new MockLoggingObserver(), LocalUpdateServiceTestTracker);

        await updateService.ManageInstalls(0);

        assert.lengthOf(acquireContexts, 1, 'Runtime group should still trigger acquisition');
        assert.strictEqual(acquireContexts[0].version, '8.0', 'Runtime acquisition should target the major.minor version');

        assert.lengthOf(uninstallContexts, 1, 'Only the outdated runtime install should be removed');
        assert.strictEqual(uninstallContexts[0].version, legacyInstall.dotnetInstall.version, 'The lower patch runtime should be uninstalled');

        const ownersAdded = trackerInstance.getOwnersAdded();
        assert.lengthOf(ownersAdded, 1, 'Owners should move to the newest runtime install');
        assert.strictEqual(ownersAdded[0].install.installId, latestInstall.dotnetInstall.installId, 'Highest patch runtime should receive owners');
    });

    test('It fully completes uninstalls before ManageInstalls returns so the uninstall list is accurate', async () =>
    {
        const onlineStub = {
            isOnline: async () => true
        } as unknown as WebRequestWorkerSingleton;

        (WebRequestWorkerSingleton as unknown as { getInstance: () => WebRequestWorkerSingleton }).getInstance = () => onlineStub;

        const eventStream = new MockEventStream();
        const extensionState = new MockExtensionContext();
        extensionState.update('dotnet.latestUpdateDate', new Date(0));

        const directoryProvider = new TestInstallationDirectoryProvider('/tmp');

        const legacyInstall = createInstallRecord('10.0.1', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', ['ms-dotnettools.sample-extension']);
        const latestInstall = createInstallRecord('10.0.5', DotnetCoreAcquisitionWorker.defaultArchitecture(), 'runtime', []);

        extensionState.update('installed', [legacyInstall]);

        const tracker = RealLocalUpdateServiceTracker.getInstance(eventStream, extensionState);

        const acquireStub = async (context: IDotnetAcquireContext) =>
        {
            const workerContext = getMockAcquisitionContext(context.mode ?? 'runtime', latestInstall.dotnetInstall.version, 5000, eventStream, extensionState, context.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture(), directoryProvider);
            workerContext.acquisitionContext.requestingExtensionId = context.requestingExtensionId;

            const installPath = path.join(directoryProvider.getInstallDir(latestInstall.dotnetInstall.installId), getDotnetExecutable());
            await tracker.trackInstalledVersion(workerContext, latestInstall.dotnetInstall, installPath);
            return undefined;
        };

        const uninstallStub = async (context: IDotnetAcquireContext, force: boolean, onlyCheckLiveDependents: boolean) =>
        {
            const uninstallTracker = RealLocalUpdateServiceTracker.getInstance(eventStream, extensionState);
            const architecture = context.architecture ?? DotnetCoreAcquisitionWorker.defaultArchitecture();
            const dotnetInstall: DotnetInstall = {
                version: context.version!,
                architecture,
                installId: `${context.version}~${architecture}~${context.mode}`,
                installMode: context.mode!,
                isGlobal: false
            };

            const workerContext = getMockAcquisitionContext(context.mode ?? 'runtime', context.version!, 5000, eventStream, extensionState, architecture, directoryProvider);
            workerContext.acquisitionContext.requestingExtensionId = context.requestingExtensionId;

            const installExePath = path.join(directoryProvider.getInstallDir(dotnetInstall.installId), getDotnetExecutable());

            await uninstallTracker.untrackInstalledVersion(workerContext, dotnetInstall, force);

            const noDependents = force ? true : onlyCheckLiveDependents ?
                await uninstallTracker.installHasNoLiveDependentsBesidesId(installExePath, directoryProvider, context.requestingExtensionId ?? '', dotnetInstall) :
                await uninstallTracker.installHasNoRegisteredDependentsBesidesId(dotnetInstall, directoryProvider, false, context.requestingExtensionId ?? '');

            if (force || noDependents)
            {
                await uninstallTracker.reportSuccessfulUninstall(workerContext, dotnetInstall, force);
            }

            return '0';
        };

        const updateService = new LocalInstallUpdateService(eventStream, extensionState, directoryProvider, acquireStub, uninstallStub, new MockLoggingObserver(), RealLocalUpdateServiceTracker);

        await updateService.ManageInstalls(0);

        // Immediately after ManageInstalls returns, the outdated install must already be removed from state.
        // Previously (before the fix), the uninstall was fire-and-forget so the old version would still appear
        // in the Uninstall .NET list when queried right after ManageInstalls returned.
        const remainingInstalls = await tracker.getExistingInstalls(directoryProvider, false);
        assert.deepEqual(
            remainingInstalls.map(install => install.dotnetInstall.installId),
            [latestInstall.dotnetInstall.installId],
            'Outdated installs must be fully removed from state by the time ManageInstalls returns, not fire-and-forget'
        );
    }).timeout(10000);
});
