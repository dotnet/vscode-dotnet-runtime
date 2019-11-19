/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Memento } from 'vscode';
import { IEventStream } from '../../EventStream';
import { IEvent } from '../../IEvent';
import { IAcquisitionInvoker } from '../../IAcquisitionInvoker';
import { DotnetAcquisitionCompleted, TestAcquireCalled } from '../../EventStreamEvents';
import { IDotnetInstallationContext } from '../../IDotnetInstallationContext';
import { IVersionResolver } from '../../IVersionResolver';

export class MockExtensionContext implements Memento {
    private values: { [n: string]: any; } = {};
    
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get(key: any, defaultValue?: any) {
        let value = this.values![key];
		if (typeof value === 'undefined') {
			value = defaultValue;
		}
		return value;
    }
    update(key: string, value: any): Thenable<void> {
        return this.values[key] = value;
    }
}

export class MockEventStream implements IEventStream {
    public events : IEvent[] = [];
    public post(event: IEvent) {
        this.events = this.events.concat(event);
    }
}

export class NoInstallAcquisitionInvoker extends IAcquisitionInvoker {
    public installDotnet(installContext: IDotnetInstallationContext): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.eventStream.post(new TestAcquireCalled(installContext));
            this.eventStream.post(new DotnetAcquisitionCompleted(installContext.version, installContext.dotnetPath));
            resolve();

        });
    }
}

export const latestVersionMap: { [version: string]: string | undefined } = {
    '1.0': '1.0.16',
    '1.1': '1.1.13',
    '2.0': '2.0.9',
    '2.1': '2.1.11',
    '2.2': '2.2.5',
};

export class MockVersionResolver extends IVersionResolver {
    resolveVersion(version: string): Promise<string> {
        this.validateVersionInput(version);

        const resolvedVersion = latestVersionMap[version];
        if (resolvedVersion) {
            return Promise.resolve(resolvedVersion);
        }
        return Promise.reject('Unable to resolve version');
    }
}