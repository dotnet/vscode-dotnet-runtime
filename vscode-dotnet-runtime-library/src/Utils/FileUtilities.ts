 /* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
 import * as eol from 'eol';
 import * as fs from 'fs';
 import * as path from 'path';

export class FileUtilities {
    constructor() {}

    public static writeFileOntoDisk(scriptContent: string, filePath: string)
    {
        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        scriptContent = eol.auto(scriptContent);
        fs.writeFileSync(filePath, scriptContent);
        fs.chmodSync(filePath, 0o700);}
    }
}

