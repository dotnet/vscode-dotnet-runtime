/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { filterEnvVars, isValidEnvironmentVariableName } from '../../Utils/TypescriptUtilities';

const assert = chai.assert;

suite('TypescriptUtilities Unit Tests', function ()
{
    this.timeout(15000);

    suite('isValidEnvironmentVariableName', function ()
    {
        test('accepts standard alphanumeric names', function ()
        {
            assert.isTrue(isValidEnvironmentVariableName('PATH'));
            assert.isTrue(isValidEnvironmentVariableName('DOTNET_ROOT'));
            assert.isTrue(isValidEnvironmentVariableName('SystemRoot'));
            assert.isTrue(isValidEnvironmentVariableName('MY_VAR_123'));
            assert.isTrue(isValidEnvironmentVariableName('_PRIVATE'));
            assert.isTrue(isValidEnvironmentVariableName('a'));
        });

        test('rejects names with parentheses', function ()
        {
            // Windows env vars like CommonProgramFiles(x86) and ProgramFiles(x86) cause
            // @vscode/sudo-prompt to throw: "options.env has an invalid environment variable name"
            assert.isFalse(isValidEnvironmentVariableName('CommonProgramFiles(x86)'));
            assert.isFalse(isValidEnvironmentVariableName('ProgramFiles(x86)'));
            assert.isFalse(isValidEnvironmentVariableName('SOME_VAR(1)'));
            assert.isFalse(isValidEnvironmentVariableName('(LEADING_PAREN)'));
        });

        test('rejects names with other non-POSIX characters', function ()
        {
            // @vscode/sudo-prompt enforces strict POSIX: /^[a-zA-Z_][a-zA-Z0-9_]*$/
            assert.isFalse(isValidEnvironmentVariableName('MY-VAR'));
            assert.isFalse(isValidEnvironmentVariableName('MY.VAR'));
            assert.isFalse(isValidEnvironmentVariableName('MY VAR'));
            assert.isFalse(isValidEnvironmentVariableName('1STARTS_WITH_DIGIT'));
            assert.isFalse(isValidEnvironmentVariableName(''));
        });
    });

    suite('filterEnvVars', function ()
    {
        test('removes env vars with non-POSIX names', function ()
        {
            const env: NodeJS.ProcessEnv = {
                PATH: '/usr/bin:/bin',
                'CommonProgramFiles(x86)': 'C:\\Program Files (x86)\\Common Files',
                'ProgramFiles(x86)': 'C:\\Program Files (x86)',
                DOTNET_ROOT: 'C:\\dotnet',
                'some.dotted.var': 'value',
                'hyphen-var': 'value',
            };

            const filtered = filterEnvVars(env);

            assert.exists(filtered['PATH'], 'PATH should be retained');
            assert.exists(filtered['DOTNET_ROOT'], 'DOTNET_ROOT should be retained');
            assert.notExists(filtered['CommonProgramFiles(x86)'], 'CommonProgramFiles(x86) should be removed');
            assert.notExists(filtered['ProgramFiles(x86)'], 'ProgramFiles(x86) should be removed');
            assert.notExists(filtered['some.dotted.var'], 'Dotted names should be removed');
            assert.notExists(filtered['hyphen-var'], 'Hyphenated names should be removed');
        });

        test('retains all valid env vars', function ()
        {
            const env: NodeJS.ProcessEnv = {
                PATH: '/usr/bin:/bin',
                SYSTEMROOT: 'C:\\Windows',
                ALLUSERSPROFILE: 'C:\\ProgramData',
            };

            const filtered = filterEnvVars(env);

            assert.deepEqual(filtered, env, 'All valid env vars should be retained unchanged');
        });

        test('handles empty env object', function ()
        {
            const filtered = filterEnvVars({});
            assert.deepEqual(filtered, {}, 'Empty env should produce empty result');
        });
    });
});
