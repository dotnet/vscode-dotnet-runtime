/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

export enum EventType {
    DotnetAcquisitionStart,
    DotnetSDKAcquisitionStart,
    DotnetRuntimeAcquisitionStart,
    DotnetASPNetRuntimeAcquisitionStarted,
    DotnetAcquisitionCompleted,
    DotnetAcquisitionError,
    DotnetAcquisitionSuccessEvent,
    DotnetAcquisitionMessage,
    DotnetAcquisitionTest,
    DotnetAcquisitionAlreadyInstalled,
    DotnetAcquisitionInProgress,
    DotnetDebuggingMessage,
    DotnetTotalSuccessEvent,
    DotnetUpgradedEvent,
    SuppressedAcquisitionError,
    DotnetInstallExpectedAbort,

    DotnetModalChildEvent, // For sub-events that are published as a more specific version of an existing published generic event.
    // Example: DotnetAcquisitionStarted -> Children events are RuntimeStarted, SDKStarted, etc.
}
