/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main()
{
    try
    {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

        // The path to the extension test runner script
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './index');

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

        // Download VS Code, unzip it and run the integration test
        await runTests(
            {
                ...(platformValue !== '' && { platform: platformValue }),
                extensionDevelopmentPath,
                extensionTestsPath,
                launchArgs: [
                    // This disables all extensions except the one being testing
                    '--disable-extensions',
                ],
                extensionTestsEnv: { DOTNET_INSTALL_TOOL_UNDER_TEST: 'true' }
            }
        );
    }
    catch (err)
    {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();
