/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
export function sanitize(content: string)
{
    const user = process.env.USERNAME === undefined ? process.env.USER : process.env.USERNAME;

    if (user === undefined)
    {
        // Couldn't determine user, therefore can't truly sanitize the content.
        return content;
    }

    const replacer = new RegExp(user, 'g');
    const sanitizedContent = content.replace(replacer, 'anonymous');
    return sanitizedContent;
}

export function sanitizeProperties(properties: { [key: string]: string } | undefined): { [key: string]: string } | undefined
{
    if (properties === undefined)
    {
        return properties;
    }
    const sanitizedProperties: { [key: string]: string } = {};
    for (const property of Object.keys(properties ?? {}))
    {
        sanitizedProperties[property] = sanitize(properties[property]);
    }
    return sanitizedProperties;
}
