/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IExistingPaths, ILocalExistingPath } from '..';

export interface IExtensionConfigurationWorker
{
    getAllPathConfigurationValues(): IExistingPaths | undefined;
    getSharedPathConfigurationValue(): string | undefined;
    setSharedPathConfigurationValue(configValue: string): Promise<void>;
}
