/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { mkdtemp, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { runTests, TestOptions } from '@vscode/test-electron';

export async function runTestsWithProfile(options: TestOptions): Promise<void>
{
    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'vscode-dotnet-runtime-tests-'));
    try
    {
        // Electron reads the default session's Preferences from the user-data root.
        await writeFile(path.join(userDataDir, 'Preferences'), JSON.stringify({
            browser: { enable_spellchecking: false }
        }));

        await runTests({
            ...options,
            launchArgs: [...(options.launchArgs ?? []), `--user-data-dir=${userDataDir}`]
        });
    }
    finally
    {
        await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
    }
}
