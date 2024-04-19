/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IExistingPaths, IExtensionConfiguration, ILocalExistingPath } from '../IExtensionContext';
import { IExtensionConfigurationWorker } from './IExtensionConfigurationWorker';

export class ExtensionConfigurationWorker implements IExtensionConfigurationWorker {
    constructor(private readonly extensionConfiguration: IExtensionConfiguration,
                private readonly pathConfigValueName: string | undefined,
                private readonly sharedExistingDotnetPath: string | undefined) {}

    public getPathConfigurationValue(): IExistingPaths | undefined {
        return this.pathConfigValueName ? this.extensionConfiguration.get(this.pathConfigValueName) : undefined;
    }

    public async setPathConfigurationValue(configValue: string, setGlobalSetting : boolean): Promise<void> {
        if (!this.pathConfigValueName) {
            throw Error('Existing path configuration not supported.');
        }


        let existingSettings = this.getPathConfigurationValue();
        let newSettings = {
            localExistingPaths : !setGlobalSetting ? existingSettings?.localExistingPaths?.concat(
                {
                    extensionId: this.sharedExistingDotnetPath as string,
                    path: configValue
                }
            ) : existingSettings?.localExistingPaths,
            globalExistingPath : setGlobalSetting ? configValue : existingSettings?.globalExistingPath,
        } as IExistingPaths;

        await this.extensionConfiguration.update<IExistingPaths>(this.pathConfigValueName, newSettings, true);
    }
}
