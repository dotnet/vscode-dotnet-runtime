"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestAcquireCalled = exports.DotnetPreinstallDetected = exports.WebRequestSent = exports.DotnetAcquisitionStatusResolved = exports.DotnetAcquisitionStatusUndefined = exports.DotnetAcquisitionStatusRequested = exports.DotnetAcquisitionRequested = exports.DotnetInstallationValidated = exports.DotnetAcquisitionScriptOuput = exports.DotnetAcquisitionMissingLinuxDependencies = exports.DotnetAcquisitionAlreadyInstalled = exports.DotnetAcquisitionInProgress = exports.DotnetAcquisitionPartialInstallation = exports.DotnetFallbackInstallScriptUsed = exports.DotnetAcquisitionDeletion = exports.DotnetAcquisitionMessage = exports.DotnetExistingPathResolutionCompleted = exports.DotnetInstallScriptAcquisitionCompleted = exports.DotnetVersionResolutionCompleted = exports.DotnetUninstallAllCompleted = exports.DotnetUninstallAllStarted = exports.DotnetCommandSucceeded = exports.DotnetAcquisitionSuccessEvent = exports.DotnetInstallationValidationError = exports.DotnetVersionResolutionError = exports.DotnetAcquisitionTimeoutError = exports.DotnetOfflineFailure = exports.DotnetAcquisitionScriptError = exports.DotnetAcquisitionInstallError = exports.DotnetAcquisitionUnexpectedError = exports.DotnetAcquisitionVersionError = exports.DotnetCommandFailed = exports.DotnetPreinstallDetectionError = exports.WebRequestError = exports.DotnetInstallScriptAcquisitionError = exports.DotnetAcquisitionError = exports.DotnetAcquisitionCompleted = exports.DotnetSDKAcquisitionStarted = exports.DotnetRuntimeAcquisitionStarted = exports.DotnetAcquisitionStarted = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const fs = require("fs");
const path = require("path");
const EventType_1 = require("./EventType");
const IEvent_1 = require("./IEvent");
// tslint:disable max-classes-per-file
class DotnetAcquisitionStarted extends IEvent_1.IEvent {
    constructor(version) {
        super();
        this.version = version;
        this.eventName = 'DotnetAcquisitionStarted';
        this.type = EventType_1.EventType.DotnetAcquisitionStart;
    }
    getProperties() {
        return { AcquisitionStartVersion: this.version };
    }
}
exports.DotnetAcquisitionStarted = DotnetAcquisitionStarted;
class DotnetRuntimeAcquisitionStarted extends IEvent_1.IEvent {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetRuntimeAcquisitionStarted';
        this.type = EventType_1.EventType.DotnetRuntimeAcquisitionStart;
    }
    getProperties() {
        return undefined;
    }
}
exports.DotnetRuntimeAcquisitionStarted = DotnetRuntimeAcquisitionStarted;
class DotnetSDKAcquisitionStarted extends IEvent_1.IEvent {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetSDKAcquisitionStarted';
        this.type = EventType_1.EventType.DotnetSDKAcquisitionStart;
    }
    getProperties() {
        return undefined;
    }
}
exports.DotnetSDKAcquisitionStarted = DotnetSDKAcquisitionStarted;
class DotnetAcquisitionCompleted extends IEvent_1.IEvent {
    constructor(version, dotnetPath) {
        super();
        this.version = version;
        this.dotnetPath = dotnetPath;
        this.eventName = 'DotnetAcquisitionCompleted';
        this.type = EventType_1.EventType.DotnetAcquisitionCompleted;
    }
    getProperties(telemetry = false) {
        if (telemetry) {
            return { AcquisitionCompletedVersion: this.version };
        }
        else {
            return { AcquisitionCompletedVersion: this.version,
                AcquisitionCompletedDotnetPath: this.dotnetPath };
        }
    }
}
exports.DotnetAcquisitionCompleted = DotnetAcquisitionCompleted;
class DotnetAcquisitionError extends IEvent_1.IEvent {
    constructor(error) {
        super();
        this.error = error;
        this.type = EventType_1.EventType.DotnetAcquisitionError;
        this.isError = true;
    }
    getProperties(telemetry = false) {
        return { ErrorName: this.error.name,
            ErrorMessage: this.error.message,
            StackTrace: this.error.stack ? this.error.stack : '' };
    }
}
exports.DotnetAcquisitionError = DotnetAcquisitionError;
class DotnetInstallScriptAcquisitionError extends DotnetAcquisitionError {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetInstallScriptAcquisitionError';
    }
}
exports.DotnetInstallScriptAcquisitionError = DotnetInstallScriptAcquisitionError;
class WebRequestError extends DotnetAcquisitionError {
    constructor() {
        super(...arguments);
        this.eventName = 'WebRequestError';
    }
}
exports.WebRequestError = WebRequestError;
class DotnetPreinstallDetectionError extends DotnetAcquisitionError {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetPreinstallDetectionError';
    }
}
exports.DotnetPreinstallDetectionError = DotnetPreinstallDetectionError;
class DotnetCommandFailed extends DotnetAcquisitionError {
    constructor(error, command) {
        super(error);
        this.command = command;
        this.eventName = 'DotnetCommandFailed';
    }
    getProperties(telemetry = false) {
        return { ErrorMessage: this.error.message,
            CommandName: this.command,
            ErrorName: this.error.name,
            StackTrace: this.error.stack ? this.error.stack : '' };
    }
}
exports.DotnetCommandFailed = DotnetCommandFailed;
class DotnetAcquisitionVersionError extends DotnetAcquisitionError {
    constructor(error, version) {
        super(error);
        this.version = version;
    }
    getProperties(telemetry = false) {
        return { ErrorMessage: this.error.message,
            AcquisitionErrorVersion: this.version,
            ErrorName: this.error.name,
            StackTrace: this.error.stack ? this.error.stack : '' };
    }
}
exports.DotnetAcquisitionVersionError = DotnetAcquisitionVersionError;
class DotnetAcquisitionUnexpectedError extends DotnetAcquisitionVersionError {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetAcquisitionUnexpectedError';
    }
}
exports.DotnetAcquisitionUnexpectedError = DotnetAcquisitionUnexpectedError;
class DotnetAcquisitionInstallError extends DotnetAcquisitionVersionError {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetAcquisitionInstallError';
    }
}
exports.DotnetAcquisitionInstallError = DotnetAcquisitionInstallError;
class DotnetAcquisitionScriptError extends DotnetAcquisitionVersionError {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetAcquisitionScriptError';
    }
}
exports.DotnetAcquisitionScriptError = DotnetAcquisitionScriptError;
class DotnetOfflineFailure extends DotnetAcquisitionVersionError {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetOfflineFailure';
    }
}
exports.DotnetOfflineFailure = DotnetOfflineFailure;
class DotnetAcquisitionTimeoutError extends DotnetAcquisitionVersionError {
    constructor(error, version, timeoutValue) {
        super(error, version);
        this.timeoutValue = timeoutValue;
        this.eventName = 'DotnetAcquisitionTimeoutError';
    }
    getProperties(telemetry = false) {
        return { ErrorMessage: this.error.message,
            TimeoutValue: this.timeoutValue.toString(),
            Version: this.version,
            ErrorName: this.error.name,
            StackTrace: this.error.stack ? this.error.stack : '' };
    }
}
exports.DotnetAcquisitionTimeoutError = DotnetAcquisitionTimeoutError;
class DotnetVersionResolutionError extends DotnetAcquisitionVersionError {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetVersionResolutionError';
    }
}
exports.DotnetVersionResolutionError = DotnetVersionResolutionError;
class DotnetInstallationValidationError extends DotnetAcquisitionVersionError {
    constructor(error, version, dotnetPath) {
        super(error, version);
        this.dotnetPath = dotnetPath;
        this.eventName = 'DotnetInstallationValidationError';
        this.fileStructure = this.getFileStructure();
    }
    getProperties(telemetry = false) {
        return { ErrorMessage: this.error.message,
            AcquisitionErrorVersion: this.version,
            ErrorName: this.error.name,
            StackTrace: this.error.stack ? this.error.stack : '',
            FileStructure: this.fileStructure };
    }
    getFileStructure() {
        const folderPath = path.dirname(this.dotnetPath);
        if (!fs.existsSync(folderPath)) {
            return `Dotnet Path (${path.basename(folderPath)}) does not exist`;
        }
        // Get 2 levels worth of content of the folder
        let files = fs.readdirSync(folderPath).map(file => path.join(folderPath, file));
        for (const file of files) {
            if (fs.statSync(file).isDirectory()) {
                files = files.concat(fs.readdirSync(file).map(fileName => path.join(file, fileName)));
            }
        }
        const relativeFiles = [];
        for (const file of files) {
            relativeFiles.push(path.relative(path.dirname(folderPath), file));
        }
        return relativeFiles.join('\n');
    }
}
exports.DotnetInstallationValidationError = DotnetInstallationValidationError;
class DotnetAcquisitionSuccessEvent extends IEvent_1.IEvent {
    constructor() {
        super(...arguments);
        this.type = EventType_1.EventType.DotnetAcquisitionSuccessEvent;
    }
    getProperties() {
        return undefined;
    }
}
exports.DotnetAcquisitionSuccessEvent = DotnetAcquisitionSuccessEvent;
class DotnetCommandSucceeded extends DotnetAcquisitionSuccessEvent {
    constructor(commandName) {
        super();
        this.commandName = commandName;
        this.eventName = 'DotnetCommandSucceeded';
    }
    getProperties() {
        return { CommandName: this.commandName };
    }
}
exports.DotnetCommandSucceeded = DotnetCommandSucceeded;
class DotnetUninstallAllStarted extends DotnetAcquisitionSuccessEvent {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetUninstallAllStarted';
    }
}
exports.DotnetUninstallAllStarted = DotnetUninstallAllStarted;
class DotnetUninstallAllCompleted extends DotnetAcquisitionSuccessEvent {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetUninstallAllCompleted';
    }
}
exports.DotnetUninstallAllCompleted = DotnetUninstallAllCompleted;
class DotnetVersionResolutionCompleted extends DotnetAcquisitionSuccessEvent {
    constructor(requestedVerion, resolvedVersion) {
        super();
        this.requestedVerion = requestedVerion;
        this.resolvedVersion = resolvedVersion;
        this.eventName = 'DotnetVersionResolutionCompleted';
    }
    getProperties() {
        return { RequestedVersion: this.requestedVerion,
            ResolvedVersion: this.resolvedVersion };
    }
}
exports.DotnetVersionResolutionCompleted = DotnetVersionResolutionCompleted;
class DotnetInstallScriptAcquisitionCompleted extends DotnetAcquisitionSuccessEvent {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetInstallScriptAcquisitionCompleted';
    }
}
exports.DotnetInstallScriptAcquisitionCompleted = DotnetInstallScriptAcquisitionCompleted;
class DotnetExistingPathResolutionCompleted extends DotnetAcquisitionSuccessEvent {
    constructor(resolvedPath) {
        super();
        this.resolvedPath = resolvedPath;
        this.eventName = 'DotnetExistingPathResolutionCompleted';
    }
    getProperties(telemetry = false) {
        return telemetry ? undefined : { ConfiguredPath: this.resolvedPath };
    }
}
exports.DotnetExistingPathResolutionCompleted = DotnetExistingPathResolutionCompleted;
class DotnetAcquisitionMessage extends IEvent_1.IEvent {
    constructor() {
        super(...arguments);
        this.type = EventType_1.EventType.DotnetAcquisitionMessage;
    }
    getProperties() {
        return undefined;
    }
}
exports.DotnetAcquisitionMessage = DotnetAcquisitionMessage;
class DotnetAcquisitionDeletion extends DotnetAcquisitionMessage {
    constructor(folderPath) {
        super();
        this.folderPath = folderPath;
        this.eventName = 'DotnetAcquisitionDeletion';
    }
    getProperties(telemetry = false) {
        return telemetry ? undefined : { DeletedFolderPath: this.folderPath };
    }
}
exports.DotnetAcquisitionDeletion = DotnetAcquisitionDeletion;
class DotnetFallbackInstallScriptUsed extends DotnetAcquisitionMessage {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetFallbackInstallScriptUsed';
    }
}
exports.DotnetFallbackInstallScriptUsed = DotnetFallbackInstallScriptUsed;
class DotnetAcquisitionPartialInstallation extends DotnetAcquisitionMessage {
    constructor(version) {
        super();
        this.version = version;
        this.eventName = 'DotnetAcquisitionPartialInstallation';
    }
    getProperties() {
        return { PartialInstallationVersion: this.version };
    }
}
exports.DotnetAcquisitionPartialInstallation = DotnetAcquisitionPartialInstallation;
class DotnetAcquisitionInProgress extends DotnetAcquisitionMessage {
    constructor(version) {
        super();
        this.version = version;
        this.eventName = 'DotnetAcquisitionInProgress';
    }
    getProperties() {
        return { InProgressInstallationVersion: this.version };
    }
}
exports.DotnetAcquisitionInProgress = DotnetAcquisitionInProgress;
class DotnetAcquisitionAlreadyInstalled extends DotnetAcquisitionMessage {
    constructor(version) {
        super();
        this.version = version;
        this.eventName = 'DotnetAcquisitionAlreadyInstalled';
    }
    getProperties() {
        return { AlreadyInstalledVersion: this.version };
    }
}
exports.DotnetAcquisitionAlreadyInstalled = DotnetAcquisitionAlreadyInstalled;
class DotnetAcquisitionMissingLinuxDependencies extends DotnetAcquisitionMessage {
    constructor() {
        super(...arguments);
        this.eventName = 'DotnetAcquisitionMissingLinuxDependencies';
    }
}
exports.DotnetAcquisitionMissingLinuxDependencies = DotnetAcquisitionMissingLinuxDependencies;
class DotnetAcquisitionScriptOuput extends DotnetAcquisitionMessage {
    constructor(version, output) {
        super();
        this.version = version;
        this.output = output;
        this.eventName = 'DotnetAcquisitionScriptOuput';
        this.isError = true;
    }
    getProperties(telemetry = false) {
        return { AcquisitionVersion: this.version,
            ScriptOutput: this.output };
    }
}
exports.DotnetAcquisitionScriptOuput = DotnetAcquisitionScriptOuput;
class DotnetInstallationValidated extends DotnetAcquisitionMessage {
    constructor(version) {
        super();
        this.version = version;
        this.eventName = 'DotnetInstallationValidated';
    }
    getProperties(telemetry = false) {
        return { ValidatedVersion: this.version };
    }
}
exports.DotnetInstallationValidated = DotnetInstallationValidated;
class DotnetAcquisitionRequested extends DotnetAcquisitionMessage {
    constructor(version, requestingId = '') {
        super();
        this.version = version;
        this.requestingId = requestingId;
        this.eventName = 'DotnetAcquisitionRequested';
    }
    getProperties() {
        return { AcquisitionStartVersion: this.version,
            RequestingExtensionId: this.requestingId };
    }
}
exports.DotnetAcquisitionRequested = DotnetAcquisitionRequested;
class DotnetAcquisitionStatusRequested extends DotnetAcquisitionMessage {
    constructor(version, requestingId = '') {
        super();
        this.version = version;
        this.requestingId = requestingId;
        this.eventName = 'DotnetAcquisitionStatusRequested';
    }
    getProperties() {
        return { AcquisitionStartVersion: this.version,
            RequestingExtensionId: this.requestingId };
    }
}
exports.DotnetAcquisitionStatusRequested = DotnetAcquisitionStatusRequested;
class DotnetAcquisitionStatusUndefined extends DotnetAcquisitionMessage {
    constructor(version) {
        super();
        this.version = version;
        this.eventName = 'DotnetAcquisitionStatusUndefined';
    }
    getProperties() {
        return { AcquisitionStatusVersion: this.version };
    }
}
exports.DotnetAcquisitionStatusUndefined = DotnetAcquisitionStatusUndefined;
class DotnetAcquisitionStatusResolved extends DotnetAcquisitionMessage {
    constructor(version) {
        super();
        this.version = version;
        this.eventName = 'DotnetAcquisitionStatusResolved';
    }
    getProperties() {
        return { AcquisitionStatusVersion: this.version };
    }
}
exports.DotnetAcquisitionStatusResolved = DotnetAcquisitionStatusResolved;
class WebRequestSent extends DotnetAcquisitionMessage {
    constructor(url) {
        super();
        this.url = url;
        this.eventName = 'WebRequestSent';
    }
    getProperties() {
        return { WebRequestUri: this.url };
    }
}
exports.WebRequestSent = WebRequestSent;
class DotnetPreinstallDetected extends DotnetAcquisitionMessage {
    constructor(version) {
        super();
        this.version = version;
        this.eventName = 'DotnetPreinstallDetected';
    }
    getProperties() {
        return { PreinstalledVersion: this.version };
    }
}
exports.DotnetPreinstallDetected = DotnetPreinstallDetected;
class TestAcquireCalled extends IEvent_1.IEvent {
    constructor(context) {
        super();
        this.context = context;
        this.eventName = 'TestAcquireCalled';
        this.type = EventType_1.EventType.DotnetAcquisitionTest;
    }
    getProperties() {
        return undefined;
    }
}
exports.TestAcquireCalled = TestAcquireCalled;
//# sourceMappingURL=EventStreamEvents.js.map