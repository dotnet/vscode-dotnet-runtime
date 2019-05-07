"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const EventType_1 = require("./EventType");
// tslint:disable max-classes-per-file
class DotnetAcquisitionStarted {
    constructor(version) {
        this.version = version;
        this.type = EventType_1.EventType.DotnetAcquisitionStart;
    }
}
exports.DotnetAcquisitionStarted = DotnetAcquisitionStarted;
class DotnetAcquisitionError {
    constructor() {
        this.type = EventType_1.EventType.DotnetAcquisitionError;
    }
}
exports.DotnetAcquisitionError = DotnetAcquisitionError;
class DotnetAcquisitionUnexpectedError extends DotnetAcquisitionError {
    constructor(error) {
        super();
        this.error = error;
    }
    getErrorMessage() {
        if (this.error) {
            return this.error.toString();
        }
        return '';
    }
}
exports.DotnetAcquisitionUnexpectedError = DotnetAcquisitionUnexpectedError;
class DotnetAcquisitionInstallError extends DotnetAcquisitionError {
    constructor(error) {
        super();
        this.error = error;
    }
    getErrorMessage() {
        return `Exit code: ${this.error.code}
Message: ${this.error.message}`;
    }
}
exports.DotnetAcquisitionInstallError = DotnetAcquisitionInstallError;
class DotnetAcquisitionScriptError extends DotnetAcquisitionError {
    constructor(error) {
        super();
        this.error = error;
    }
    getErrorMessage() {
        return this.error;
    }
}
exports.DotnetAcquisitionScriptError = DotnetAcquisitionScriptError;
class DotnetAcquisitionCompleted {
    constructor(dotnetPath) {
        this.dotnetPath = dotnetPath;
        this.type = EventType_1.EventType.DotnetAcquisitionCompleted;
    }
}
exports.DotnetAcquisitionCompleted = DotnetAcquisitionCompleted;
//# sourceMappingURL=EventStreamEvents.js.map