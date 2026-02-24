/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

/**
 * This is a dedicated test runner for Language Model Tools tests only.
 * Use `npm run test:lm-tools` to run these tests in isolation for faster iteration.
 *
 * NOTE FOR AI AGENTS: When working on Language Model Tools (LanguageModelTools.ts),
 * use `npm run test:lm-tools` instead of `npm test` for faster feedback.
 * The full test suite takes ~7 minutes, while LM tools tests take ~30 seconds.
 */

import * as os from 'os';
import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main()
{
    try
    {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
        const extensionTestsPath = path.resolve(__dirname, './indexLmTools');

        let platformValue = '';
        switch (os.platform())
        {
            case 'win32':
                platformValue = 'win32-x64-archive';
                break;
            case 'darwin':
                platformValue = 'darwin';
                break;
            case 'linux':
                platformValue = 'linux-x64';
                break;
        }

        await runTests(
            {
                ...(platformValue !== '' && { platform: platformValue }),
                extensionDevelopmentPath,
                extensionTestsPath,
                launchArgs: [
                    '--disable-extensions',
                ],
                extensionTestsEnv: { DOTNET_INSTALL_TOOL_UNDER_TEST: 'true' }
            }
        );
    }
    catch (err)
    {
        console.error(err);
        console.error('Failed to run Language Model Tools tests');
        process.exit(1);
    }
}

main();
