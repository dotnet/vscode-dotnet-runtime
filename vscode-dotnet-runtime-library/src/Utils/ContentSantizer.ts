/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export function sanitize(content: string) {
    const user = process.env.USERNAME === undefined ? process.env.USER : process.env.USERNAME;

    if (user === undefined) {
        // Couldn't determine user, therefore can't truly sanitize the content.
        return content;
    }

    const replacer = new RegExp(user, 'g');
    const sanitizedContent = content.replace(replacer, 'anonymous');
    return sanitizedContent;
}

export function sanitizeProperties(properties: { [key: string]: string } | undefined): { [key: string]: string } | undefined {
    if (properties === undefined) {
        return properties;
    }
    const sanitizedProperties: { [key: string]: string } = {};
    for (const property of Object.keys(properties)) {
        sanitizedProperties[property] = sanitize(properties[property]);
    }
    return sanitizedProperties;
}
