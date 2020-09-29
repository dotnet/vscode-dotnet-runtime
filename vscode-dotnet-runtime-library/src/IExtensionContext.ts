/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IWindowDisplayWorker } from './EventStream/IWindowDisplayWorker';
import { ITelemetryReporter } from './EventStream/TelemetryObserver';

export interface IExtensionContext {
    telemetryReporter: ITelemetryReporter | undefined;
    extensionConfiguration: IExtensionConfiguration;
    displayWorker: IWindowDisplayWorker;
}

export interface IExtensionConfiguration {
    get<T>(name: string): T | undefined;
}

export interface IExistingPath {
    ['extensionId']: string;
    ['path']: string;
}
