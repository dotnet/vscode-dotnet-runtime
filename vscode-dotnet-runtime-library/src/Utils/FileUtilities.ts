 /* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
 import * as eol from 'eol';
 import * as fs from 'fs';
 import * as path from 'path';
 import * as os from 'os';
 import * as proc from 'child_process';
 import * as crypto from 'crypto';
import { IFileUtilities } from './IFileUtilities';
export class FileUtilities extends IFileUtilities
{
    public writeFileOntoDisk(scriptContent: string, filePath: string)
    {
        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }
        scriptContent = eol.auto(scriptContent);
        fs.writeFileSync(filePath, scriptContent);
        fs.chmodSync(filePath, 0o700);
    }

    public wipeDirectory(directoryToWipe : string)
    {
        if(!fs.existsSync(directoryToWipe))
        {
            return;
        }

        // Use rimraf to delete all of the items in a directory without the directory itself.
        fs.readdirSync(directoryToWipe).forEach(f => fs.rmSync(`${directoryToWipe}/${f}`));
    }

    public isElevated() : boolean
    {
        if(os.platform() !== 'win32')
        {
            const commandResult = proc.spawnSync('id', ['-u']);
            return commandResult.status === 0;
        }

        try
        {
            // If we can execute this command on Windows then we have admin rights.
            proc.execFileSync( 'net', ['session'], { 'stdio': 'ignore' } );
            return true;
        }
        catch ( error )
        {
            return false;
        }
    }

    private sha512Hasher(filePath : string)
    {
        return new Promise<string>((resolve, reject) =>
        {
            const hash = crypto.createHash('sha512');
            const fileStream = fs.createReadStream(filePath);
            fileStream.on('error', err => reject(err));
            fileStream.on('data', chunk => hash.update(chunk));
            fileStream.on('end', () => resolve(hash.digest('hex')));
        })
    };

    public async getFileHash(filePath : string) : Promise<string | null>
    {
        // to do : make file read only?
        const res = await this.sha512Hasher(filePath);
        return res;
    }
}

