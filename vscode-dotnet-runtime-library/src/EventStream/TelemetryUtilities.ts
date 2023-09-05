 /* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { TextEncoder } from 'util';

export class TelemetryUtilities
{
    public static HashData(dataToHash: string | null) : string
    {
        if(!dataToHash)
        {
            return '';
        }

        const hasher = crypto.createHash('sha256');
        const utf8Bytes = new TextEncoder().encode(dataToHash.toUpperCase());
        const hashedData = hasher.update(utf8Bytes).digest('hex').toLowerCase();
        return hashedData;
    }

    /**
     *
     * @param stringWithPaths The string that may contain paths to hash.
     * @returns The same string but with all paths in it hashed.
     * @remarks Will not hash a filename as it is a leaf file system object. It needs to be a path with at least one directory.
     * That's what we'd like to hash. (E.g. dotnet-install.ps1 is not needed to hash.)
     */
    public static HashAllPaths(stringWithPaths : string) : string
    {
        let hashedPathsString = ``;
        stringWithPaths.split(' ').forEach(word =>
        {
            const convertedLine = word !== path.basename(word) && fs.existsSync(word) && (fs.lstatSync(word).isFile() || fs.lstatSync(word).isDirectory())
                ? TelemetryUtilities.HashData(word) : word;
            hashedPathsString = `${hashedPathsString} ${convertedLine}`;
            return hashedPathsString;
        });
        return hashedPathsString;
    }
}