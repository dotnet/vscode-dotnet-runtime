/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const assert = chai.assert;

function writeExecutable(filePath: string, content: string): void
{
    fs.writeFileSync(filePath, content);
    fs.chmodSync(filePath, 0o755);
}

suite('Linux Prereqs Installer Script Unit Tests', function ()
{
    test('Debian install uses a libicu package pattern that supports newer package versions', function ()
    {
        if (os.platform() !== 'linux')
        {
            this.skip();
        }

        const scriptPath = path.resolve(__dirname, '../../../install scripts/install-linux-prereqs.sh');
        const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dotnet-prereqs-script-'));
        const fakeBin = path.join(testRoot, 'bin');
        const aptGetLog = path.join(testRoot, 'apt-get.log');
        fs.mkdirSync(fakeBin);

        try
        {
            writeExecutable(path.join(fakeBin, 'id'), '#!/usr/bin/env bash\nif [ "$1" = "-u" ]; then echo 0; exit 0; fi\nexit 0\n');
            writeExecutable(path.join(fakeBin, 'fuser'), '#!/usr/bin/env bash\nexit 1\n');
            writeExecutable(path.join(fakeBin, 'apt-get'), '#!/usr/bin/env bash\necho "$*" >> "$APT_GET_LOG"\nexit 0\n');
            writeExecutable(path.join(fakeBin, 'dpkg-query'), '#!/usr/bin/env bash\nprintf "ii\\tlibssl1.0.0:amd64\\n"\nexit 0\n');

            const result = cp.spawnSync('bash', [scriptPath, 'Debian', '', 'false', ''], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    APT_GET_LOG: aptGetLog,
                    PATH: `${fakeBin}:${process.env.PATH ?? ''}`
                }
            });

            assert.equal(result.status, 0, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
            assert.notInclude(result.stderr, 'command not found');
            assert.notInclude(result.stderr, 'integer expected');

            const aptGetCalls = fs.readFileSync(aptGetLog, 'utf8');
            assert.include(aptGetCalls, 'update');
            assert.include(aptGetCalls, 'install -yq ^libicu[0-9][0-9]*$ libkrb5-3 zlib1g');
        }
        finally
        {
            fs.rmSync(testRoot, { recursive: true, force: true });
        }
    });
});