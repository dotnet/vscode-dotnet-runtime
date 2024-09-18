/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as os from 'os';

import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';
import { MockDotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext, MockInstallationValidator, MockVSCodeEnvironment, MockVSCodeExtensionContext } from '../mocks/MockObjects';
import { IDotnetAcquireContext } from '../../IDotnetAcquireContext';
import { IAcquisitionWorkerContext } from '../../Acquisition/IAcquisitionWorkerContext';
import { IEventStream } from '../../EventStream/EventStream';
import { IUtilityContext } from '../../Utils/IUtilityContext';
import { IInstallationDirectoryProvider } from '../../Acquisition/IInstallationDirectoryProvider';
import { directoryProviderFactory } from '../../Acquisition/DirectoryProviderFactory';
import { DotnetInstallMode } from '../../Acquisition/DotnetInstallMode';

const standardTimeoutTime = 100000;

export function getMockAcquisitionContext(mode: DotnetInstallMode, version : string, timeoutTime : number = standardTimeoutTime, customEventStream? : IEventStream,
    customContext? : MockExtensionContext, arch? : string | null, directory? : IInstallationDirectoryProvider): IAcquisitionWorkerContext
{
    const extensionContext = customContext ?? new MockExtensionContext();
    const myEventStream = customEventStream ?? new MockEventStream();
    const workerContext : IAcquisitionWorkerContext =
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
        allowInvalidPathSetting: customContext?.get('allowInvalidPaths') ?? false
    };
    return workerContext;
}

export function getMockAcquisitionWorkerContext(acquireContext : IDotnetAcquireContext)
{
    const extensionContext = new MockExtensionContext();
    const myEventStream = new MockEventStream();
    const workerContext : IAcquisitionWorkerContext =
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

export function getMockAcquisitionWorker(mockContext : IAcquisitionWorkerContext) : MockDotnetCoreAcquisitionWorker
{
    const acquisitionWorker = new MockDotnetCoreAcquisitionWorker(getMockUtilityContext(), new MockVSCodeExtensionContext());
    return acquisitionWorker;
}

export function getMockUtilityContext() : IUtilityContext
{
    const utilityContext : IUtilityContext = {
        ui : new MockWindowDisplayWorker(),
        vsCodeEnv : new MockVSCodeEnvironment()
    }
    return utilityContext;
}

export function getMockAcquireContext(nextAcquiringVersion : string, arch : string | null | undefined, installMode : DotnetInstallMode) : IDotnetAcquireContext
{
    const acquireContext : IDotnetAcquireContext =
    {
        version: nextAcquiringVersion,
        architecture: arch,
        requestingExtensionId: 'test',
        mode: installMode
    };
    return acquireContext;
}