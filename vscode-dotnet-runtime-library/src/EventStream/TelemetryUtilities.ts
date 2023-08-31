 /* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
 import * as crypto from 'crypto';
import { TextEncoder } from 'util';

export class TelemetryUtilities
{
    public static HashData(dataToHash: string) : string
    {
        const hasher = crypto.createHash('sha256');
        const utf8Bytes = new TextEncoder().encode(dataToHash.toUpperCase());
        const hashedData = hasher.update(utf8Bytes).digest('hex').toLowerCase();
        return hashedData;
    }
}