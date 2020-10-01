/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { IExistingPath } from '..';

export interface IExtensionConfigurationWorker {
    getPathConfigurationValue(): IExistingPath[] | undefined;
    setPathConfigurationValue(configValue: IExistingPath[]): Promise<void>;
}
