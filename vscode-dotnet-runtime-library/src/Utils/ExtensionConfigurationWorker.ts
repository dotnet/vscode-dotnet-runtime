/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IExistingPaths, IExtensionConfiguration, ILocalExistingPath } from '../IExtensionContext';
import { IExtensionConfigurationWorker } from './IExtensionConfigurationWorker';

export class ExtensionConfigurationWorker implements IExtensionConfigurationWorker {
    constructor(private readonly extensionConfiguration: IExtensionConfiguration,
                private readonly pathConfigValueName: string | undefined) {}

    public getPathConfigurationValue(): IExistingPaths | undefined {
        return this.pathConfigValueName ? this.extensionConfiguration.get(this.pathConfigValueName) : undefined;
    }

    public async setLocalPathConfigurationValue(configValue: ILocalExistingPath[]): Promise<void> {
        if (!this.pathConfigValueName) {
            throw Error('Existing path configuration not supported.');
        }
        await this.extensionConfiguration.update<ILocalExistingPath[]>(this.pathConfigValueName, configValue, true);
    }
}
