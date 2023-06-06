"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventType = void 0;
var EventType;
(function (EventType) {
    EventType[EventType["DotnetAcquisitionStart"] = 0] = "DotnetAcquisitionStart";
    EventType[EventType["DotnetSDKAcquisitionStart"] = 1] = "DotnetSDKAcquisitionStart";
    EventType[EventType["DotnetRuntimeAcquisitionStart"] = 2] = "DotnetRuntimeAcquisitionStart";
    EventType[EventType["DotnetAcquisitionCompleted"] = 3] = "DotnetAcquisitionCompleted";
    EventType[EventType["DotnetAcquisitionError"] = 4] = "DotnetAcquisitionError";
    EventType[EventType["DotnetAcquisitionSuccessEvent"] = 5] = "DotnetAcquisitionSuccessEvent";
    EventType[EventType["DotnetAcquisitionMessage"] = 6] = "DotnetAcquisitionMessage";
    EventType[EventType["DotnetAcquisitionTest"] = 7] = "DotnetAcquisitionTest";
})(EventType = exports.EventType || (exports.EventType = {}));
//# sourceMappingURL=EventType.js.map