/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */


import * as os from 'os';
import { directoryProviderFactory } from '../../Acquisition/DirectoryProviderFactory';
import { DotnetInstallMode } from '../../Acquisition/DotnetInstallMode';
import { IAcquisitionWorkerContext } from '../../Acquisition/IAcquisitionWorkerContext';
import { IInstallationDirectoryProvider } from '../../Acquisition/IInstallationDirectoryProvider';
import { IUtilityContext } from '../../Utils/IUtilityContext';
import { INodeIPCMutexLogger, NodeIPCMutex } from '../../Utils/NodeIPCMutex';
import { DistroVersionPair, LinuxVersionResolver } from '../../Acquisition/LinuxVersionResolver';
import { RED_HAT_DISTRO_INFO_KEY, UBUNTU_DISTRO_INFO_KEY } from '../../Acquisition/StringConstants';
import { IEventStream } from '../../EventStream/EventStream';
import { IDotnetAcquireContext } from '../../IDotnetAcquireContext';
import { MockDotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext, MockInstallationValidator, MockVSCodeEnvironment, MockVSCodeExtensionContext } from '../mocks/MockObjects';
import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';

const standardTimeoutTime = 100000;

export function getMockAcquisitionContext(mode: DotnetInstallMode, version: string, timeoutTime: number = standardTimeoutTime, customEventStream?: IEventStream,
    customContext?: MockExtensionContext, arch?: string | null, directory?: IInstallationDirectoryProvider): IAcquisitionWorkerContext
{
    const extensionContext = customContext ?? new MockExtensionContext();
    const myEventStream = customEventStream ?? new MockEventStream();
    const workerContext: IAcquisitionWorkerContext =
    {
        storagePath: '',
        extensionState: extensionContext,
        eventStream: myEventStream,
        acquisitionContext: getMockAcquireContext(version, arch, mode),
        installationValidator: new MockInstallationValidator(myEventStream),
        timeoutSeconds: timeoutTime,
        proxyUrl: undefined,
        installDirectoryProvider: directory ? directory : directoryProviderFactory(mode, ''),
        isExtensionTelemetryInitiallyEnabled: true,
        allowInvalidPathSetting: customContext?.get('dotnetAcquisitionExtension.allowInvalidPaths') ?? false
    };
    return workerContext;
}

export function getMockAcquisitionWorkerContext(acquireContext: IDotnetAcquireContext)
{
    const extensionContext = new MockExtensionContext();
    const myEventStream = new MockEventStream();
    const workerContext: IAcquisitionWorkerContext =
    {
        storagePath: '',
        extensionState: extensionContext,
        eventStream: myEventStream,
        acquisitionContext: acquireContext,
        installationValidator: new MockInstallationValidator(myEventStream),
        timeoutSeconds: standardTimeoutTime,
        proxyUrl: undefined,
        installDirectoryProvider: directoryProviderFactory(acquireContext.mode!, ''),
        isExtensionTelemetryInitiallyEnabled: true,
        allowInvalidPathSetting: false
    };
    return workerContext;
}

export function getMockAcquisitionWorker(mockContext: IAcquisitionWorkerContext): MockDotnetCoreAcquisitionWorker
{
    const acquisitionWorker = new MockDotnetCoreAcquisitionWorker(getMockUtilityContext(), new MockVSCodeExtensionContext());
    return acquisitionWorker;
}

export function getMockUtilityContext(): IUtilityContext
{
    const utilityContext: IUtilityContext = {
        ui: new MockWindowDisplayWorker(),
        vsCodeEnv: new MockVSCodeEnvironment()
    }
    return utilityContext;
}

export function getMockAcquireContext(nextAcquiringVersion: string, arch: string | null | undefined, installMode: DotnetInstallMode): IDotnetAcquireContext
{
    const acquireContext: IDotnetAcquireContext =
    {
        version: nextAcquiringVersion,
        architecture: arch,
        requestingExtensionId: 'test',
        mode: installMode
    };
    return acquireContext;
}

export const acquiredText = 'Acquired Lock:';
export const releasedText = 'Released Lock:';

export async function wait(delayMs: number)
{
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

export class INodeIPCTestLogger extends INodeIPCMutexLogger
{
    public logs: string[] = [];

    public log(msg: string): void
    {
        this.logs.push(msg);
    }
}

export async function printWithLock(lock: string, msg: string, timeToLive: number, logger: INodeIPCTestLogger, fn: () => Promise<void> = () => { return Promise.resolve(); }, retryDelayMs: number = 10)
{
    const mutex = new NodeIPCMutex(lock, logger);

    const c = await mutex.acquire(async () =>
    {
        logger.log(`${acquiredText}${msg}`);
        await fn();
        await wait(timeToLive);
        logger.log(`${releasedText}${msg}`);
        await fn();
        return msg;
    }, 40, timeToLive, msg);

    logger.log(`After release, ${msg} returned c: ${c}`);
}

export async function getDistroInfo(context: IAcquisitionWorkerContext): Promise<DistroVersionPair>
{
    if (os.platform() !== 'linux')
    {
        return { distro: '', version: '' };
    }
    return new LinuxVersionResolver(context, getMockUtilityContext()).getRunningDistro();
}

/**
 *
 * @param distroInfo The distro and version of the system
 * @returns The built-in distro supported version of the .NET SDK.
 * Only maintaining the microsoft supported versions for now.
 */
export async function getLinuxSupportedDotnetSDKVersion(context: IAcquisitionWorkerContext, distroInfo?: DistroVersionPair): Promise<string>
{
    distroInfo ??= await getDistroInfo(context);

    if (distroInfo.distro === UBUNTU_DISTRO_INFO_KEY)
    {
        if (distroInfo.version < '22.04')
        {
            return '6.0.100';
        }
        if (distroInfo.version < '22.06')
        {
            return '9.0.100';
        }
        if (distroInfo.version < '24.04')
        {
            return '8.0.100';
        }
        else
        {
            return '8.0.100';
        }
    }
    else if (distroInfo.distro === RED_HAT_DISTRO_INFO_KEY)
    {
        if (distroInfo.version < '8.0')
        {
            return '7.0.100';
        }
        else
        {
            return '9.0.100';
        }
    }
    return getLatestLinuxDotnet(); // best effort guess for latest 'dotnet' version atm.
}

export function getLatestLinuxDotnet()
{
    return '9.0.100';
}