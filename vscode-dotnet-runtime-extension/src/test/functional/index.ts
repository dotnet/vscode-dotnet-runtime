/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import { glob } from 'glob';
import * as Mocha from 'mocha';
import * as path from 'path';

export async function run(): Promise<void>
{
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        // Support filtering tests by grep pattern via environment variable
        grep: process.env.TEST_GREP ? new RegExp(process.env.TEST_GREP) : undefined,
    });

    const testsRoot = path.resolve(__dirname, '..');

    // Support filtering test files via environment variable (e.g., "LanguageModelTools" to only run that file)
    const testFilePattern = process.env.TEST_FILE_PATTERN || '**/functional/**.test.js';
    const files = await glob(testFilePattern, { cwd: testsRoot });

    return new Promise((c, e) =>
    {
        // Add files to the test suite
        files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

        try
        {
            // Run the mocha test
            mocha.run(failures =>
            {
                if (failures > 0)
                {
                    e(new Error(`${failures} tests failed.`));
                } else
                {
                    c();
                }
            });
        } catch (err)
        {
            e(err);
        }
    });
}
