/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

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
import { CommandExecutorCommand, ICommandExecutor } from '../../Utils/ICommandExecutor';
import { CommandExecutor } from '../../Utils/CommandExecutor';
import { IDistroDotnetSDKProvider } from '../../Acquisition/IDistroDotnetSDKProvider';
import { DistroVersionPair, DotnetDistroSupportStatus } from '../../Acquisition/LinuxVersionResolver';
import { GenericDistroSDKProvider } from '../../Acquisition/GenericDistroSDKProvider';
import { IAcquisitionWorkerContext } from '../../Acquisition/IAcquisitionWorkerContext';
import { FileUtilities } from '../../Utils/FileUtilities';
import { IFileUtilities } from '../../Utils/IFileUtilities';
import { AcquisitionInvoker } from '../../Acquisition/AcquisitionInvoker';
import { DotnetCoreAcquisitionWorker } from '../../Acquisition/DotnetCoreAcquisitionWorker';
import { IVSCodeExtensionContext } from '../../IVSCodeExtensionContext';
import { IUtilityContext } from '../../Utils/IUtilityContext';
import { getMockUtilityContext } from '../unit/TestUtility';
import { IVSCodeEnvironment } from '../../Utils/IVSCodeEnvironment';

const testDefaultTimeoutTimeMs = 60000;
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
        return Object.keys(this.values);
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
            this.eventStream.post(new DotnetAcquisitionCompleted(
                DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(installContext.version, installContext.architecture),
                installContext.dotnetPath, installContext.version));
            resolve();

        });
    }
}

export class MockDotnetCoreAcquisitionWorker extends DotnetCoreAcquisitionWorker
{
    public AddToGraveyard(installKey : string, installPath : string)
    {
        this.updateGraveyard(installKey, installPath);
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
    constructor(extensionState: IExtensionState, eventStream: IEventStream, uri: string, extensionStateKey: string,
                private readonly mockFilePath: string) {
        super(extensionState, eventStream, uri, testDefaultTimeoutTimeMs);
    }

    protected async makeWebRequest(): Promise<string | undefined> {
        const result =  JSON.parse(fs.readFileSync(this.mockFilePath, 'utf8'));
        return result;
    }
}

export class FailingWebRequestWorker extends WebRequestWorker {
    constructor(extensionState: IExtensionState, eventStream: IEventStream, uri: string) {
        super(extensionState, eventStream, '', testDefaultTimeoutTimeMs); // Empty string as uri to cause failure. Uri is required to match the interface even though it's unused.
    }

    public async getCachedData(): Promise<string | undefined> {
        throw new Error('Fail!');
    }
}

export class MockTrackingWebRequestWorker extends WebRequestWorker {
    private requestCount = 0;
    public response = 'Mock Web Request Result';

    constructor(extensionState: IExtensionState, eventStream: IEventStream, url: string,
            protected readonly succeed = true, webTimeToLive = testDefaultTimeoutTimeMs, cacheTimeToLive = testDefaultTimeoutTimeMs)
    {
        super(extensionState, eventStream, url, webTimeToLive, '', cacheTimeToLive);
    }

    public getRequestCount() {
        return this.requestCount;
    }

    public incrementRequestCount() {
        this.requestCount++;
    }
    protected async makeWebRequest(shouldThrow = false, retries = 2): Promise<string | undefined> {
        if ( !(await this.isUrlCached()) )
        {
            this.incrementRequestCount();
        }
        return super.makeWebRequest(shouldThrow, retries);
    }
}

export class MockWebRequestWorker extends MockTrackingWebRequestWorker {
    public readonly errorMessage = 'Web Request Failed';
    public response = 'Mock Web Request Result';

    constructor(extensionState: IExtensionState, eventStream: IEventStream, url: string) {
        super(extensionState, eventStream, url);
    }

    protected async makeWebRequest(): Promise<string | undefined> {
        this.incrementRequestCount()
        if (this.succeed) {
            try // axios will return a json object instead of a string if the object is json. mimic this.
            {
                JSON.parse(this.response);
            }
            catch (e)
            {
                return this.response;
            }
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

    constructor(extensionState: IExtensionState, eventStream: IEventStream, url: string,
        protected readonly succeed = true, webTimeToLive = testDefaultTimeoutTimeMs, cacheTimeToLive = testDefaultTimeoutTimeMs)
    {
            super(extensionState, eventStream, url, webTimeToLive, '', cacheTimeToLive);
    }

    public async getCachedData(retriesCount = 2): Promise<string | undefined>
    {
        const urlResponseIndex = this.knownUrls.indexOf(this.url);
        if(urlResponseIndex === -1)
        {
            throw Error(`The requested URL ${this.url} was not expected as the mock object did not have a set response for it.`)
        }
        return JSON.parse(this.matchingUrlResponses[urlResponseIndex]);
    }

}

export class MockVSCodeExtensionContext extends IVSCodeExtensionContext
{
    appendToEnvironmentVariable(variable: string, pathAdditionWithDelimiter: string): void {
        // Do nothing.
    }

    setVSCodeEnvironmentVariable(variable: string, value: string): void {
        // Do nothing.
    }
}

export class MockVSCodeEnvironment extends IVSCodeEnvironment
{
    isTelemetryEnabled(): boolean
    {
        return true;
    }
}

export class MockVersionResolver extends VersionResolver {
    private readonly filePath = path.join(__dirname, '../../..', 'src', 'test', 'mocks', 'mock-releases.json');

    constructor(extensionState: IExtensionState, eventStream: IEventStream) {
        super(extensionState, eventStream, testDefaultTimeoutTimeMs);
        this.webWorker = new FileWebRequestWorker(extensionState, eventStream, '', 'releases', this.filePath);
    }
}

export class MockInstallScriptWorker extends InstallScriptAcquisitionWorker {
    constructor(extensionState: IExtensionState, eventStream: IEventStream, failing: boolean, private fallback = false) {
        super(extensionState, eventStream, testDefaultTimeoutTimeMs);
        this.webWorker = failing ?
            new FailingWebRequestWorker(extensionState, eventStream, '') :
            new MockWebRequestWorker(extensionState, eventStream, '');
    }

    protected getFallbackScriptPath(): string {
        if (this.fallback) {
            return path.join(__dirname, '..');
        } else {
            return super.getFallbackScriptPath();
        }
    }
}

export class MockApostropheScriptAcquisitionWorker extends MockInstallScriptWorker
{
    protected readonly scriptFilePath: string;
    constructor(extensionState: IExtensionState, eventStream: IEventStream, installFolder: string) {
        super(extensionState, eventStream, false);
        const scriptFileEnding = 'win32';
        const scriptFileName = 'dotnet-install';
        this.scriptFilePath = path.join(installFolder, 'install scripts', `${scriptFileName}.${scriptFileEnding}`);
    }
}


export class MockAcquisitionInvoker extends AcquisitionInvoker
{
    protected readonly scriptWorker: MockApostropheScriptAcquisitionWorker
    constructor(extensionState: IExtensionState, eventStream: IEventStream, timeoutTime : number, installFolder : string) {
        super(extensionState, eventStream, timeoutTime, getMockUtilityContext());
        this.scriptWorker = new MockApostropheScriptAcquisitionWorker(extensionState, eventStream, installFolder);
    }
}

/**
 * @remarks does NOT run the commands (if they have sudo), but records them to verify the correct command should've been run.
 */
export class MockCommandExecutor extends ICommandExecutor
{
    private trueExecutor : CommandExecutor;
    public fakeReturnValue = '';
    public attemptedCommand = '';

    // If you expect several commands to be run and want to specify unique outputs for each, describe them in the same order using the below two arrays.
    // We will check for an includes match and not an exact match!
    public otherCommandsToMock : string[] = [];
    public otherCommandsReturnValues : string[] = [];

    constructor(eventStream : IEventStream, utilContext : IUtilityContext)
    {
        super(eventStream, utilContext);
        this.trueExecutor = new CommandExecutor(eventStream, utilContext);
    }

    public async execute(command: CommandExecutorCommand, options : object | null = null): Promise<string>
    {
        this.attemptedCommand = CommandExecutor.prettifyCommandExecutorCommand(command);

        if(!command.runUnderSudo && this.fakeReturnValue === '')
        {
            return this.trueExecutor.execute(command, options);
        }
        else if(this.otherCommandsToMock.some(x => x.includes(command.commandRoot)))
        {
            const fakeResultIndex = this.otherCommandsToMock.findIndex(x => x.includes(command.commandRoot));
            // We don't need to verify the index since this is test code!
            return this.otherCommandsReturnValues[fakeResultIndex];
        }
        else
        {
            return this.fakeReturnValue;
        }
    }

    public async executeMultipleCommands(commands: CommandExecutorCommand[], options?: any): Promise<string[]>
    {
        const result = [];
        for(const command of commands)
        {
            result.push(await this.execute(command));
        }
        return result;
    }

    public async tryFindWorkingCommand(commands: CommandExecutorCommand[]): Promise<CommandExecutorCommand> {
        return commands[0];
    }
}

export class MockFileUtilities extends IFileUtilities
{
    private trueUtilities = new FileUtilities();

    public writeFileOntoDisk(content : string, filePath : string)
    {
        return this.trueUtilities.writeFileOntoDisk(content, filePath, new MockEventStream());
    }

    public wipeDirectory(directoryToWipe : string)
    {
        return this.trueUtilities.wipeDirectory(directoryToWipe);
    }

    public isElevated()
    {
        return this.trueUtilities.isElevated();
    }

    public async getFileHash(filePath : string)
    {
        return '';
    }

}

/**
 * @remarks does NOT run the commands (if they have sudo), but records them to verify the correct command should've been run.
 */
export class MockDistroProvider extends IDistroDotnetSDKProvider
{
    public installReturnValue = '';
    public installedSDKsReturnValue = [];
    public installedRuntimesReturnValue : string[] = [];
    public globalPathReturnValue : string | null = '';
    public globalVersionReturnValue : string | null = '';
    public distroFeedReturnValue = '';
    public microsoftFeedReturnValue = '';
    public packageExistsReturnValue = false;
    public supportStatusReturnValue : DotnetDistroSupportStatus = DotnetDistroSupportStatus.Distro;
    public recommendedVersionReturnValue = '';
    public upgradeReturnValue = '';
    public uninstallReturnValue = '';
    public context: IAcquisitionWorkerContext;

    constructor(version : DistroVersionPair, context : IAcquisitionWorkerContext, utilContext : IUtilityContext, commandRunner : ICommandExecutor)
    {
        super(version, context, utilContext, commandRunner);
        this.context = context;
    }

    public installDotnet(fullySpecifiedVersion: string): Promise<string> {
        this.commandRunner.execute(CommandExecutor.makeCommand('install', [`dotnet`]));
        return Promise.resolve(this.installReturnValue);
    }

    public getInstalledDotnetSDKVersions(): Promise<string[]> {
        this.commandRunner.execute(CommandExecutor.makeCommand(`get`, [`sdk`, `versions`]));
        return Promise.resolve(this.installedSDKsReturnValue);
    }

    public getInstalledDotnetRuntimeVersions(): Promise<string[]> {
        this.commandRunner.execute(CommandExecutor.makeCommand(`get`, [`runtime`, `versions`]));
        return Promise.resolve(this.installedRuntimesReturnValue);
    }

    public getInstalledGlobalDotnetPathIfExists(): Promise<string | null> {
        this.commandRunner.execute(CommandExecutor.makeCommand(`global`, [`path`]));
        return Promise.resolve(this.globalPathReturnValue);
    }

    public getInstalledGlobalDotnetVersionIfExists(): Promise<string | null> {
        this.commandRunner.execute(CommandExecutor.makeCommand(`global`, [`version`]));
        return Promise.resolve(this.globalVersionReturnValue);
    }

    public getExpectedDotnetDistroFeedInstallationDirectory(): string {
        this.commandRunner.execute(CommandExecutor.makeCommand(`distro`, [`feed`, `dir`]));
        return this.distroFeedReturnValue;
    }

    public getExpectedDotnetMicrosoftFeedInstallationDirectory(): string {
        this.commandRunner.execute(CommandExecutor.makeCommand(`microsoft`, [`feed`, `dir`]));
        return this.microsoftFeedReturnValue;
    }

    public dotnetPackageExistsOnSystem(fullySpecifiedVersion: string): Promise<boolean> {
        this.commandRunner.execute(CommandExecutor.makeCommand(`package`, [`check`]));
        return Promise.resolve(this.packageExistsReturnValue);
    }

    public getDotnetVersionSupportStatus(fullySpecifiedVersion: string): Promise<DotnetDistroSupportStatus> {
        this.commandRunner.execute(CommandExecutor.makeCommand(`support`, [`status`]));
        return Promise.resolve(this.supportStatusReturnValue);
    }

    public getRecommendedDotnetVersion(): string {
        this.commandRunner.execute(CommandExecutor.makeCommand(`recommended`, [`version`]));
        return this.recommendedVersionReturnValue;
    }

    public upgradeDotnet(versionToUpgrade: string): Promise<string> {
        this.commandRunner.execute(CommandExecutor.makeCommand(`upgrade`, [`update`, `dotnet`]));
        return Promise.resolve(this.upgradeReturnValue);
    }

    public uninstallDotnet(versionToUninstall: string): Promise<string> {
        this.commandRunner.execute(CommandExecutor.makeCommand(`uninstall`, [`dotnet`]));
        return Promise.resolve(this.uninstallReturnValue);
    }

    public JsonDotnetVersion(fullySpecifiedDotnetVersion: string): string {
        return new GenericDistroSDKProvider(this.distroVersion, this.context, getMockUtilityContext()).JsonDotnetVersion(fullySpecifiedDotnetVersion);
    }
}


export class FailingInstallScriptWorker extends InstallScriptAcquisitionWorker {
    constructor(extensionState: IExtensionState, eventStream: IEventStream) {
        super(extensionState, eventStream, testDefaultTimeoutTimeMs);
        this.webWorker = new MockWebRequestWorker(extensionState, eventStream, '');
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
