"use strict";
/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.IEvent = void 0;
const ContentSantizer_1 = require("../Utils/ContentSantizer");
class IEvent {
    constructor() {
        this.isError = false;
    }
    getSanitizedProperties() {
        return (0, ContentSantizer_1.sanitizeProperties)(this.getProperties(true));
    }
}
exports.IEvent = IEvent;
//# sourceMappingURL=IEvent.js.map