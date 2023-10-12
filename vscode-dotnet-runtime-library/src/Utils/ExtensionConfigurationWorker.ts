/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IExistingPath, IExtensionConfiguration } from '../IExtensionContext';
import { IExtensionConfigurationWorker } from './IExtensionConfigurationWorker';

export class ExtensionConfigurationWorker implements IExtensionConfigurationWorker {
    constructor(private readonly extensionConfiguration: IExtensionConfiguration,
                private readonly pathConfigValueName: string | undefined) {}

    public getPathConfigurationValue(): IExistingPath[] | undefined {
        return this.pathConfigValueName ? this.extensionConfiguration.get(this.pathConfigValueName) : undefined;
    }

    public async setPathConfigurationValue(configValue: IExistingPath[]): Promise<void> {
        if (!this.pathConfigValueName) {
            throw Error('Existing path configuration not supported.');
        }
        await this.extensionConfiguration.update<IExistingPath[]>(this.pathConfigValueName, configValue, true);
    }
}
