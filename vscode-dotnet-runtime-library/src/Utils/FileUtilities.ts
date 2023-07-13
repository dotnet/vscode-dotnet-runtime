 /* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
 import * as eol from 'eol';
 import * as fs from 'fs';
 import * as path from 'path';
 import * as os from 'os';
 import * as proc from 'child_process';
const rimraf = require('rimraf');

export class FileUtilities {
    constructor() {}

    public static writeFileOntoDisk(scriptContent: string, filePath: string)
    {
        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        scriptContent = eol.auto(scriptContent);
        fs.writeFileSync(filePath, scriptContent);
        fs.chmodSync(filePath, 0o700);
    }

    /**
     * @param directoryToWipe the directory to delete all of the files in if privellege to do so exists.
     */
    public static wipeDirectory(directoryToWipe : string)
    {
        if(!fs.existsSync(directoryToWipe))
        {
            return;
        }

        // Use rimraf to delete all of the items in a directory without the directory itself.
        fs.readdirSync(directoryToWipe).forEach(f => fs.rmSync(`${directoryToWipe}/${f}`));
    }

    /**
     *
     * @returns true if the process is running with admin privelleges on windows.
     */
    public static isElevated() : boolean
    {
        if(os.platform() !== 'win32')
        {
            const commandResult = proc.spawnSync("id", ["-u"]);
            return commandResult.status === 0;
        }

        try
        {
            // If we can execute this command on Windows then we have admin rights.
            proc.execFileSync( "net", ["session"], { "stdio": "ignore" } );
            return true;
        }
        catch ( error )
        {
            return false;
        }
    }
}

