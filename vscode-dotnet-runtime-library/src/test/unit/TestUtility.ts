/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as os from 'os';

import { RuntimeInstallationDirectoryProvider } from '../../Acquisition/RuntimeInstallationDirectoryProvider';
import { SdkInstallationDirectoryProvider } from '../../Acquisition/SdkInstallationDirectoryProvider';
import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';
import { MockDotnetCoreAcquisitionWorker, MockEventStream, MockExtensionContext, MockInstallationValidator, MockVSCodeEnvironment, MockVSCodeExtensionContext } from '../mocks/MockObjects';
import { IDotnetAcquireContext } from '../../IDotnetAcquireContext';
import { IAcquisitionWorkerContext } from '../../Acquisition/IAcquisitionWorkerContext';
import { IEventStream } from '../../EventStream/EventStream';
import { IUtilityContext } from '../../Utils/IUtilityContext';
import { IInstallationDirectoryProvider } from '../../Acquisition/IInstallationDirectoryProvider';

const standardTimeoutTime = 100000;

export function getMockAcquisitionContext(runtimeInstall: boolean, version : string, timeoutTime : number = standardTimeoutTime, customEventStream? : IEventStream,
    customContext? : MockExtensionContext, arch? : string | null, directory? : IInstallationDirectoryProvider): IAcquisitionWorkerContext
{
    const extensionContext = customContext ?? new MockExtensionContext();
    const myEventStream = customEventStream ?? new MockEventStream();
    const workerContext : IAcquisitionWorkerContext =
    {
        storagePath: '',
        extensionState: extensionContext,
        eventStream: myEventStream,
        acquisitionContext: getMockAcquireContext(version),
        installationValidator: new MockInstallationValidator(myEventStream),
        timeoutSeconds: timeoutTime,
        installingArchitecture: arch,
        proxyUrl: undefined,
        installDirectoryProvider: directory ? directory : runtimeInstall ? new RuntimeInstallationDirectoryProvider('') : new SdkInstallationDirectoryProvider(''),
        isExtensionTelemetryInitiallyEnabled: true
    };
    return workerContext;
}

export function getMockAcquisitionWorker(runtimeInstall: boolean, version : string, arch? : string | null, customEventStream? : MockEventStream,
    customContext? : MockExtensionContext, directory? : IInstallationDirectoryProvider) : MockDotnetCoreAcquisitionWorker
{
    const acquisitionWorker = new MockDotnetCoreAcquisitionWorker(getMockAcquisitionContext(runtimeInstall, version, undefined, customEventStream, customContext, arch, directory),
        getMockUtilityContext(), new MockVSCodeExtensionContext());
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

export function getMockAcquireContext(nextAcquiringVersion : string, legacy = false) : IDotnetAcquireContext
{
    const acquireContext : IDotnetAcquireContext =
    {
        version: nextAcquiringVersion,
        architecture: legacy ? null : os.arch(),
        requestingExtensionId: 'test'
    };
    return acquireContext;
}