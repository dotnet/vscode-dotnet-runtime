/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { IDotnetCoreAcquisitionWorker } from '../Acquisition/IDotnetCoreAcquisitionWorker';
import { IVersionResolver } from '../Acquisition/IVersionResolver';
import { EventStream } from '../EventStream/EventStream';
import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { ErrorConfiguration } from '../Utils/ErrorHandler';
import { IExtensionConfigurationWorker } from '../Utils/IExtensionConfigurationWorker';
import { IIssueContext } from '../Utils/IIssueContext';

/* tslint:disable:no-any */
export interface ICommand {
    name: string;
    callback: (...args: any[]) => any;
}

export type IssueContextCallback = (errorConfiguration: ErrorConfiguration | undefined, commandName: string, version?: string | undefined) => IIssueContext;

export namespace commandKeys {
    export const acquire = 'acquire';
    export const uninstallAll = 'uninstallAll';
    export const showAcquisitionLog = 'showAcquisitionLog';
    export const ensureDotnetDependencies = 'ensureDotnetDependencies';
    export const reportIssue = 'reportIssue';
}

export interface IExtensionCommandContext {
    acquisitionWorker: IDotnetCoreAcquisitionWorker;
    extensionConfigWorker: IExtensionConfigurationWorker;
    displayWorker: IWindowDisplayWorker;
    versionResolver: IVersionResolver;
    eventStream: EventStream;
    issueContext: IssueContextCallback;
}

export interface ICommandProvider {
    GetExtensionCommands(context: IExtensionCommandContext): ICommand[];
}
