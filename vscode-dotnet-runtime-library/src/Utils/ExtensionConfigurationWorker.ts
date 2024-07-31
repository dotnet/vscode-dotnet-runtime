/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { EventBasedError } from '../EventStream/EventStreamEvents';
import { IExistingPaths, IExtensionConfiguration, ILocalExistingPath } from '../IExtensionContext';
import { IExtensionConfigurationWorker } from './IExtensionConfigurationWorker';

export class ExtensionConfigurationWorker implements IExtensionConfigurationWorker {
    constructor(private readonly extensionConfiguration: IExtensionConfiguration,
                private readonly pathConfigValueName: string | undefined,
                private readonly sharedExistingDotnetPath: string | undefined,
                private readonly unsupportedMessage = 'The shared existing path configuration is not supported.')
    {

    }

    public getAllPathConfigurationValues(): IExistingPaths | undefined
    {
        return {
            individualizedExtensionPaths : this.pathConfigValueName ? this.extensionConfiguration.get(this.pathConfigValueName) as ILocalExistingPath : undefined,
            sharedExistingPath : this.sharedExistingDotnetPath ? this.extensionConfiguration.get(this.sharedExistingDotnetPath) as string : undefined
        } as IExistingPaths;
    }


    public getSharedPathConfigurationValue(): string | undefined
    {
        if (!this.sharedExistingDotnetPath) {
            throw new EventBasedError('unsupportedSharedPathConfiguration', this.unsupportedMessage);
        }
        return this.pathConfigValueName ? this.extensionConfiguration.get(this.sharedExistingDotnetPath) : undefined;
    }

    public async setSharedPathConfigurationValue(configValue: string): Promise<void> {
        if (!this.sharedExistingDotnetPath) {
            throw new EventBasedError('unsupportedSharedExistingPathConfiguration', this.unsupportedMessage);
        }
        await this.extensionConfiguration.update<string>(this.sharedExistingDotnetPath, configValue, true);
    }

}
