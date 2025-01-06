/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IEventStream } from '../EventStream/EventStream';
import { IVSCodeExtensionContext } from '../IVSCodeExtensionContext';

export abstract class IRegistryReader
{
    constructor() {}

    public abstract getGlobalSdkVersionsInstalledOnMachine() : Promise<Array<string>>;
}
