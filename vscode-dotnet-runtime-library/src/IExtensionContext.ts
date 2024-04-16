/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { IWindowDisplayWorker } from './EventStream/IWindowDisplayWorker';
import { ITelemetryReporter } from './EventStream/TelemetryObserver';

export interface IExtensionContext {
    telemetryReporter: ITelemetryReporter | undefined;
    extensionConfiguration: IExtensionConfiguration;
    displayWorker: IWindowDisplayWorker;
}

export interface IExtensionConfiguration {
    get<T>(name: string): T | undefined;
    update<T>(section: string, value: T, globalSettings: boolean): Thenable<void>;
}

export namespace ExistingPathKeys {
    export const extensionIdKey = 'extensionId';
    export const pathKey = 'path';
}

export interface ILocalExistingPath {
    [ExistingPathKeys.extensionIdKey]: string;
    [ExistingPathKeys.pathKey]: string;
}

export interface IExistingPaths {
    localExistingPaths: ILocalExistingPath[];
    globalExistingPath? : string;
}
