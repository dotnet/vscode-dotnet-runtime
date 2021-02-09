/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { RuntimeCommandProvider } from './Commands/RuntimeCommandProvider';
import { SDKCommandProvider } from './Commands/SDKCommandProvider';
import { IExtensionContext } from './IExtensionContext';

export const defaultRuntimeContext: IExtensionContext = {
    commandPrefix: 'dotnet',
    configPrefix: 'dotnetAcquisitionExtension',
    displayChannelName: '.NET Runtime',
    defaultTimeoutValue: 120,
    commandProvider: new RuntimeCommandProvider(),
};

export const defaultSDKContext: IExtensionContext = {
    commandPrefix: 'dotnet-sdk',
    configPrefix: 'dotnetSDKAcquisitionExtension',
    displayChannelName: '.NET SDK',
    defaultTimeoutValue: 180,
    commandProvider: new SDKCommandProvider(),
};
