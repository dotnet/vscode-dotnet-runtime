/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as fs from 'fs';
import * as path from 'path';
import { Memento } from 'vscode';
import { IEventStream } from '../../EventStream';
import { DotnetAcquisitionCompleted, TestAcquireCalled } from '../../EventStreamEvents';
import { IAcquisitionInvoker } from '../../IAcquisitionInvoker';
import { IDotnetInstallationContext } from '../../IDotnetInstallationContext';
import { IEvent } from '../../IEvent';
import { ReleasesResult } from '../../ReleasesResult';
import { VersionResolver } from '../../VersionResolver';

export class MockExtensionContext implements Memento {
    private values: { [n: string]: any; } = {};

    public get<T>(key: string): T | undefined;
    public get<T>(key: string, defaultValue: T): T;
    public get(key: any, defaultValue?: any) {
        let value = this.values![key];
        if (typeof value === 'undefined') {
            value = defaultValue;
        }
        return value;
    }
    public update(key: string, value: any): Thenable<void> {
        return this.values[key] = value;
    }
}

export class MockEventStream implements IEventStream {
    public events: IEvent[] = [];
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

export class ErrorAcquisitionInvoker extends IAcquisitionInvoker {
    public installDotnet(installContext: IDotnetInstallationContext): Promise<void> {
        throw new Error('Command Failed');
    }
}

// Major.Minor-> Major.Minor.Patch from mock releases.json
export const versionPairs = [['1.0', '1.0.16'], ['1.1', '1.1.13'], ['2.0', '2.0.9'], ['2.1', '2.1.14'], ['2.2', '2.2.8']];

export class MockVersionResolver extends VersionResolver {
    protected async getReleasesResult(): Promise<ReleasesResult> {
        const jsonRes =  fs.readFileSync(path.join(__dirname, '../../..', 'src', 'test', 'mocks', 'mock-releases.json'), 'utf8');
        const releasesResult = new ReleasesResult(jsonRes);
        return releasesResult;
    }
}
