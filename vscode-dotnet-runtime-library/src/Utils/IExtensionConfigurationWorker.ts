/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IExistingPaths, ILocalExistingPath } from '..';

export interface IExtensionConfigurationWorker {
    // getPathConfigurationValue(): IExistingPath[] | undefined;
    getPathConfigurationValue(): IExistingPaths | undefined; 
    setPathConfigurationValue(configValue: ILocalExistingPath[]): Promise<void>;
}
