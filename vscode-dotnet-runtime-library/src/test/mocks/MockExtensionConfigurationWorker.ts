/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { ExistingPathKeys, IExistingPaths, ILocalExistingPath} from '../../IExtensionContext';
import { ExtensionConfigurationWorker } from '../../Utils/ExtensionConfigurationWorker';
import { IExtensionConfigurationWorker } from '../../Utils/IExtensionConfigurationWorker';

export class MockExtensionConfigurationWorker implements IExtensionConfigurationWorker {
    constructor(
        private mockPaths: IExistingPaths = {
        localExistingPaths: [{ [ExistingPathKeys.extensionIdKey]: 'MockRequestingExtensionId', [ExistingPathKeys.pathKey] : 'MockPath' }],
        globalExistingPath: 'MockGlobalPath'}
    ) {}

    async setPathConfigurationValue(configValue: string, setGlobalSetting: boolean): Promise<void> {
        setGlobalSetting ? this.setGlobalPathConfigurationValue(configValue) :
            this.setLocalPathConfigurationValue([{ [ExistingPathKeys.extensionIdKey]: 'MockRequestingExtensionId', [ExistingPathKeys.pathKey] : configValue }]);
    }

    public getPathConfigurationValue(): IExistingPaths | undefined {
        return this.mockPaths;
    }

    public getSharedPathConfigurationValue(): IExistingPaths | undefined {
        return this.mockPaths;
    }

    public setLocalPathConfigurationValue(configValue: ILocalExistingPath[]): Promise<void> {
        this.mockPaths.localExistingPaths = configValue;
        return new Promise((resolve) => { resolve(); });
    }

    public setGlobalPathConfigurationValue(configValue: string): Promise<void> {
        this.mockPaths.globalExistingPath = configValue;
        return new Promise((resolve) => { resolve(); });
    }
}
