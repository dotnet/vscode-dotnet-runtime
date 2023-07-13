/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as path from 'path';
import { IAcquisitionInvoker } from '../../Acquisition/IAcquisitionInvoker';
import { IDotnetInstallationContext } from '../../Acquisition/IDotnetInstallationContext';
import { IInstallationValidator } from '../../Acquisition/IInstallationValidator';
import { InstallScriptAcquisitionWorker } from '../../Acquisition/InstallScriptAcquisitionWorker';
import { VersionResolver } from '../../Acquisition/VersionResolver';
import { IEventStream } from '../../EventStream/EventStream';
import { DotnetAcquisitionCompleted, TestAcquireCalled } from '../../EventStream/EventStreamEvents';
import { IEvent } from '../../EventStream/IEvent';
import { ILoggingObserver } from '../../EventStream/ILoggingObserver';
import { ITelemetryReporter } from '../../EventStream/TelemetryObserver';
import { IExistingPath, IExtensionConfiguration } from '../../IExtensionContext';
import { IExtensionState } from '../../IExtensionState';
import { WebRequestWorker } from '../../Utils/WebRequestWorker';
import { ICommandExecutor } from '../../Utils/ICommandExecutor';
import { CommandExecutor } from '../../Utils/CommandExecutor';
import { IDistroDotnetSDKProvider } from '../../Acquisition/IDistroDotnetSDKProvider';
import { DistroVersionPair, DotnetDistroSupportStatus } from '../../Acquisition/LinuxVersionResolver';
import { GenericDistroSDKProvider } from '../../Acquisition/GenericDistroSDKProvider';
/* tslint:disable:no-any */

export class MockExtensionContext implements IExtensionState {
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
    public clear() {
        this.values = {};
    }
    public keys(): readonly string[] {
        return this.values.keys;
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

export class RejectingAcquisitionInvoker extends IAcquisitionInvoker {
    public installDotnet(installContext: IDotnetInstallationContext): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            reject('Rejecting message');
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

export class FileWebRequestWorker extends WebRequestWorker {
    constructor(extensionState: IExtensionState, eventStream: IEventStream, private readonly mockFilePath: string) {
        super(extensionState, eventStream);
    }

    protected async makeWebRequest(): Promise<string | undefined> {
        const result =  fs.readFileSync(this.mockFilePath, 'utf8');
        return result;
    }
}

export class FailingWebRequestWorker extends WebRequestWorker {
    constructor(extensionState: IExtensionState, eventStream: IEventStream) {
        super(extensionState, eventStream, ); // Empty string as uri to cause failure. Uri is required to match the interface even though it's unused.
    }

    public async getCachedData(url : string): Promise<string | undefined> {
        return super.getCachedData('', 0); // Don't retry
    }
}

export class MockWebRequestWorker extends WebRequestWorker {
    public readonly errorMessage = 'Web Request Failed';
    private requestCount = 0;
    public response = 'Mock Web Request Result';

    constructor(extensionState: IExtensionState, eventStream: IEventStream, private readonly succeed = true) {
        super(extensionState, eventStream);
    }

    public getRequestCount() {
        return this.requestCount;
    }

    protected async makeWebRequest(url : string): Promise<string | undefined> {
        this.requestCount++;
        if (this.succeed) {
            this.cacheResults(url, this.response);
            return this.response;
        } else {
            throw new Error(this.errorMessage);
        }
    }
}

export class MockIndexWebRequestWorker extends WebRequestWorker {
    public knownUrls = ['Mock Web Request Result'];
    public matchingUrlResponses = [
        ``
    ];

    constructor(extensionState: IExtensionState, eventStream: IEventStream) {
        super(extensionState, eventStream);
    }

    public async getCachedData(url : string): Promise<string | undefined> {
        const urlResponseIndex = this.knownUrls.indexOf(url);
        if(urlResponseIndex === -1)
        {
            throw Error(`The requested URL ${url} was not expected as the mock object did not have a set response for it.`)
        }
        return this.matchingUrlResponses[urlResponseIndex];
    }

}

export class MockVersionResolver extends VersionResolver {
    private readonly filePath = path.join(__dirname, '../../..', 'src', 'test', 'mocks', 'mock-releases.json');

    constructor(extensionState: IExtensionState, eventStream: IEventStream) {
        super(extensionState, eventStream);
        this.webWorker = new FileWebRequestWorker(extensionState, eventStream, this.filePath);
    }
}

export class MockInstallScriptWorker extends InstallScriptAcquisitionWorker {
    constructor(extensionState: IExtensionState, eventStream: IEventStream, failing: boolean, private fallback = false) {
        super(extensionState, eventStream);
        this.webWorker = failing ?
            new FailingWebRequestWorker(extensionState, eventStream) :
            new MockWebRequestWorker(extensionState, eventStream);
    }

    protected getFallbackScriptPath(): string {
        if (this.fallback) {
            return path.join(__dirname, '..');
        } else {
            return super.getFallbackScriptPath();
        }
    }
}

/**
 * @remarks does NOT run the commands (if they have sudo), but records them to verify the correct command should've been run.
 */
export class MockCommandExecutor extends ICommandExecutor
{
    private trueExecutor : CommandExecutor;
    public fakeReturnValue : string = '';
    public attemptedCommand : string = '';

    // If you expect several commands to be run and want to specify unique outputs for each, describe them in the same order using the below two arrays.
    // We will check for an includes match and not an exact match!
    public otherCommandsToMock : string[] = [];
    public otherCommandsReturnValues : string[] = [];

    constructor()
    {
        super();
        this.trueExecutor = new CommandExecutor();
    }

    public async execute(command: string, workingDirectory : string | null = null): Promise<string[]>
    {
        this.attemptedCommand = command;
        let commandResults : string[] = [];

        if(!command.includes("sudo") && this.fakeReturnValue === '')
        {
            commandResults = await this.trueExecutor.execute(command, workingDirectory ? null : {cwd : path.resolve(workingDirectory!)});
        }
        else if(this.otherCommandsToMock.some(x => x.includes(command)))
        {
            const fakeResultIndex = this.otherCommandsToMock.findIndex(x => x.includes(command));
            // We don't need to verify the index since this is test code!
            commandResults.push(this.otherCommandsReturnValues[fakeResultIndex]);
        }
        else
        {
            commandResults.push(this.fakeReturnValue);
        }
        return commandResults;
    }
}

/**
 * @remarks does NOT run the commands (if they have sudo), but records them to verify the correct command should've been run.
 */
export class MockDistroProvider extends IDistroDotnetSDKProvider
{
    public installReturnValue : string = '';
    public installedSDKsReturnValue : string[] = [];
    public installedRuntimesReturnValue : string[] = [];
    public globalPathReturnValue : string | null = '';
    public globalVersionReturnValue : string | null = '';
    public distroFeedReturnValue : string = '';
    public microsoftFeedReturnValue : string = '';
    public packageExistsReturnValue : boolean = false;
    public supportStatusReturnValue : DotnetDistroSupportStatus = DotnetDistroSupportStatus.Distro;
    public recommendedVersionReturnValue : string = '';
    public upgradeReturnValue : string = '';
    public uninstallReturnValue : string = '';

    constructor(version : DistroVersionPair, commandRunner : ICommandExecutor)
    {
        super(version, commandRunner);
    }

    public installDotnet(fullySpecifiedVersion: string): Promise<string> {
        this.commandRunner.execute('install dotnet');
        return Promise.resolve(this.installReturnValue);
    }

    public getInstalledDotnetSDKVersions(): Promise<string[]> {
        this.commandRunner.execute('get sdk versions');
        return Promise.resolve(this.installedSDKsReturnValue);
    }

    public getInstalledDotnetRuntimeVersions(): Promise<string[]> {
        this.commandRunner.execute('get runtime versions');
        return Promise.resolve(this.installedRuntimesReturnValue);
    }

    public getInstalledGlobalDotnetPathIfExists(): Promise<string | null> {
        this.commandRunner.execute('global path');
        return Promise.resolve(this.globalPathReturnValue);
    }

    public getInstalledGlobalDotnetVersionIfExists(): Promise<string | null> {
        this.commandRunner.execute('global version');
        return Promise.resolve(this.globalVersionReturnValue);
    }

    public getExpectedDotnetDistroFeedInstallationDirectory(): Promise<string> {
        this.commandRunner.execute('distro feed dir');
        return Promise.resolve(this.distroFeedReturnValue);
    }

    public getExpectedDotnetMicrosoftFeedInstallationDirectory(): Promise<string> {
        this.commandRunner.execute('microsoft feed dir');
        return Promise.resolve(this.microsoftFeedReturnValue);
    }

    public dotnetPackageExistsOnSystem(fullySpecifiedVersion: string): Promise<boolean> {
        this.commandRunner.execute('package check');
        return Promise.resolve(this.packageExistsReturnValue);
    }

    public getDotnetVersionSupportStatus(fullySpecifiedVersion: string): Promise<DotnetDistroSupportStatus> {
        this.commandRunner.execute('support status');
        return Promise.resolve(this.supportStatusReturnValue);
    }

    public getRecommendedDotnetVersion(): string {
        this.commandRunner.execute('recommended version');
        return this.recommendedVersionReturnValue;
    }

    public upgradeDotnet(versionToUpgrade: string): Promise<string> {
        this.commandRunner.execute('upgrade update dotnet');
        return Promise.resolve(this.upgradeReturnValue);
    }

    public uninstallDotnet(versionToUninstall: string): Promise<string> {
        this.commandRunner.execute('uninstall dotnet');
        return Promise.resolve(this.uninstallReturnValue);
    }

    public JsonDotnetVersion(fullySpecifiedDotnetVersion: string): string {
        return new GenericDistroSDKProvider(this.distroVersion).JsonDotnetVersion(fullySpecifiedDotnetVersion);
    }
}


export class FailingInstallScriptWorker extends InstallScriptAcquisitionWorker {
    constructor(extensionState: IExtensionState, eventStream: IEventStream) {
        super(extensionState, eventStream);
        this.webWorker = new MockWebRequestWorker(extensionState, eventStream);
    }

    public getDotnetInstallScriptPath() : Promise<string> {
        throw new Error('Failed to write file');
    }
}

export interface ITelemetryEvent {
    eventName: string;
    properties?: {
        [key: string]: string;
    } | undefined;
    measures?: {
        [key: string]: number;
    } | undefined;
}

export type TelemetryEvents = ITelemetryEvent[];

export class MockTelemetryReporter implements ITelemetryReporter {

    public static telemetryEvents: TelemetryEvents = [];

    public async dispose(): Promise<void> {
        // Nothing to dispose
    }

    public sendTelemetryEvent(eventName: string, properties?: { [key: string]: string; } | undefined, measures?: { [key: string]: number; } | undefined): void {
        MockTelemetryReporter.telemetryEvents = MockTelemetryReporter.telemetryEvents.concat({eventName, properties, measures});
    }

    public sendTelemetryErrorEvent(eventName: string, properties?: { [key: string]: string }, measures?: { [key: string]: number }, errorProps?: string[]): void {
        eventName = `[ERROR]:${eventName}`;
        MockTelemetryReporter.telemetryEvents = MockTelemetryReporter.telemetryEvents.concat({eventName, properties, measures});
    }
}

export class MockInstallationValidator extends IInstallationValidator {
    public validateDotnetInstall(version: string, dotnetPath: string): void {
        // Always validate
    }
}

export class MockLoggingObserver implements ILoggingObserver {
    public post(event: IEvent): void {
        // Nothing to post
    }

    public dispose(): void {
        // Nothing to dispose
    }

    public getFileLocation(): string {
        return 'Mock file location';
    }
}

export class MockExtensionConfiguration implements IExtensionConfiguration {
    constructor(private readonly existingPaths: IExistingPath[], private readonly enableTelemetry: boolean) { }

    public update<T>(section: string, value: T): Thenable<void> {
        // Not used, stubbed to implement interface
        return new Promise((resolve) => resolve());
    }

    public get<T>(name: string): T | undefined {
        if (name === 'existingDotnetPath') {
            return this.existingPaths as unknown as T;
        } else if (name === 'enableTelemetry') {
            return this.enableTelemetry as unknown as T;
        } else {
            return undefined;
        }
    }
}
