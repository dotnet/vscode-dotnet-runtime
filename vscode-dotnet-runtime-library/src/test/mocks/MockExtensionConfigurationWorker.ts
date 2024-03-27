/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { ExistingPathKeys, IExistingPaths, ILocalExistingPath} from '../../IExtensionContext';
import { IExtensionConfigurationWorker } from '../../Utils/IExtensionConfigurationWorker';

export class MockExtensionConfigurationWorker implements IExtensionConfigurationWorker {
    // constructor(private mockPaths: ILocalExistingPath[] = 
    //     [{ [ExistingPathKeys.extensionIdKey]: 'MockRequestingExtensionId', [ExistingPathKeys.pathKey] : 'MockPath' }]) { }

    constructor(
        private mockPaths: IExistingPaths = {
        localExsitingPaths: [{ [ExistingPathKeys.extensionIdKey]: 'MockRequestingExtensionId', [ExistingPathKeys.pathKey] : 'MockPath' }]}
    ) {}

    // public getPathConfigurationValue(): IExistingPath[] | undefined {
    //     return this.mockPaths;
    // }

    public getPathConfigurationValue(): IExistingPaths | undefined {
        return this.mockPaths;
    }

    // public setPathConfigurationValue(configValue: IExistingPath[]): Promise<void> {
    //     this.mockPaths = configValue;
    //     return new Promise((resolve) => { resolve(); });
    // }

    public setLocalPathConfigurationValue(configValue: ILocalExistingPath[]): Promise<void> {
        this.mockPaths.localExsitingPaths = configValue;
        return new Promise((resolve) => { resolve(); });
    }

    public setGlobalPathConfigrationValue(configValue: string): Promise<void> {
        this.mockPaths.globalExistingPathKey = configValue;
        return new Promise((resolve) => { resolve(); });
    }
}
