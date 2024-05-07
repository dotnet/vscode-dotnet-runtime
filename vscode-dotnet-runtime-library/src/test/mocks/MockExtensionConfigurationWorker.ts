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
        individualizedExtensionPaths: [{ [ExistingPathKeys.extensionIdKey]: 'MockRequestingExtensionId', [ExistingPathKeys.pathKey] : 'MockPath' }],
        sharedExistingPath: 'MockGlobalPath'}
    ) {}

    async setPathConfigurationValue(configValue: string, setGlobalSetting: boolean): Promise<void> {
        setGlobalSetting ? this.setSharedPathConfigurationValue(configValue) :
            this.setLocalPathConfigurationValue([{ [ExistingPathKeys.extensionIdKey]: 'MockRequestingExtensionId', [ExistingPathKeys.pathKey] : configValue }]);
    }

    public getAllPathConfigurationValues(): IExistingPaths | undefined {
        return this.mockPaths;
    }

    public getSharedPathConfigurationValue(): string | undefined {
        return this.mockPaths.sharedExistingPath;
    }

    public setLocalPathConfigurationValue(configValue: ILocalExistingPath[]): Promise<void> {
        this.mockPaths.individualizedExtensionPaths = configValue;
        return new Promise((resolve) => { resolve(); });
    }

    public setSharedPathConfigurationValue(configValue: string): Promise<void> {
        this.mockPaths.sharedExistingPath = configValue;
        return new Promise((resolve) => { resolve(); });
    }
}
