/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IExistingPath, IExtensionConfiguration } from '../IExtensionContext';
import { IExtensionConfigurationWorker } from './IExtensionConfigurationWorker';

export class ExtensionConfigurationWorker implements IExtensionConfigurationWorker {
    constructor(private readonly extensionConfiguration: IExtensionConfiguration,
                private readonly pathConfigValueName: string) {}

    public getPathConfigurationValue(): IExistingPath[] | undefined {
        return this.extensionConfiguration.get(this.pathConfigValueName);
    }

    public async setPathConfigurationValue(configValue: IExistingPath[]): Promise<void> {
        await this.extensionConfiguration.update<IExistingPath[]>(this.pathConfigValueName, configValue, true);
    }
}
