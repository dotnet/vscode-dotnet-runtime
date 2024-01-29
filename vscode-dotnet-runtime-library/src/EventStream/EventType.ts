/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

export enum EventType {
    DotnetAcquisitionStart,
    DotnetSDKAcquisitionStart,
    DotnetRuntimeAcquisitionStart,
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
    DotnetInstallExpectedAbort
}
