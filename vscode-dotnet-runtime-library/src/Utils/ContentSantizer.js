"use strict";
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeProperties = exports.sanitize = void 0;
function sanitize(content) {
    const user = process.env.USERNAME === undefined ? process.env.USER : process.env.USERNAME;
    if (user === undefined) {
        // Couldn't determine user, therefore can't truly sanitize the content.
        return content;
    }
    const replacer = new RegExp(user, 'g');
    const sanitizedContent = content.replace(replacer, 'anonymous');
    return sanitizedContent;
}
exports.sanitize = sanitize;
function sanitizeProperties(properties) {
    if (properties === undefined) {
        return properties;
    }
    const sanitizedProperties = {};
    for (const property of Object.keys(properties)) {
        sanitizedProperties[property] = sanitize(properties[property]);
    }
    return sanitizedProperties;
}
exports.sanitizeProperties = sanitizeProperties;
//# sourceMappingURL=ContentSantizer.js.map