/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
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
