/* --------------------------------------------------------------------------------------------
 *  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { IAcquisitionWorkerContext } from '../../Acquisition/IAcquisitionWorkerContext';
import { RuntimeInstallationDirectoryProvider } from '../../Acquisition/RuntimeInstallationDirectoryProvider';
import { SdkInstallationDirectoryProvider } from '../../Acquisition/SdkInstallationDirectoryProvider';
import { IUtilityContext } from '../../Utils/IUtilityContext';
import { MockEventStream, MockExtensionContext, MockInstallationValidator, MockVSCodeEnvironment, NoInstallAcquisitionInvoker } from '../mocks/MockObjects';
import { MockWindowDisplayWorker } from '../mocks/MockWindowDisplayWorker';
const standardTimeoutTime = 100000;

export function getMockAcquiringContext(runtimeInstall: boolean, timeoutTime : number = standardTimeoutTime): IAcquisitionWorkerContext{
    const extensionContext = new MockExtensionContext();
    const eventStream = new MockEventStream();
    const workerContext : IAcquisitionWorkerContext = {
        storagePath: '',
        extensionState: extensionContext,
        eventStream,
        acquisitionInvoker: new NoInstallAcquisitionInvoker(eventStream),
        installationValidator: new MockInstallationValidator(eventStream),
        timeoutValue: timeoutTime,
        installDirectoryProvider: runtimeInstall ? new RuntimeInstallationDirectoryProvider('') : new SdkInstallationDirectoryProvider(''),
        isExtensionTelemetryInitiallyEnabled: true,
    };
    return workerContext;
}

export function getMockUtilityContext()
{
    const utilityContext : IUtilityContext = {
        ui : new MockWindowDisplayWorker(),
        vsCodeEnv : new MockVSCodeEnvironment()
    }
    return utilityContext;
}