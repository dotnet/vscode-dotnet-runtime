/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { ExistingPathKeys, IExistingPath } from '../../IExtensionContext';
import { IExtensionConfigurationWorker } from '../../Utils/IExtensionConfigurationWorker';

export class MockExtensionConfigurationWorker implements IExtensionConfigurationWorker {
    constructor(private mockPaths: IExistingPath[] = [{ [ExistingPathKeys.extensionIdKey]: 'MockRequestingExtensionId', [ExistingPathKeys.pathKey] : 'MockPath' }]) { }

    public getPathConfigurationValue(): IExistingPath[] | undefined {
        return this.mockPaths;
    }

    public setPathConfigurationValue(configValue: IExistingPath[]): Promise<void> {
        this.mockPaths = configValue;
        return new Promise((resolve) => { resolve(); });
    }
}
