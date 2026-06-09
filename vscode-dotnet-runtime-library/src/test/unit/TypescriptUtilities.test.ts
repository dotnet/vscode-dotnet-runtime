/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { filterEnvVars, isValidEnvironmentVariableName, parseOsRelease } from '../../Utils/TypescriptUtilities';

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

    suite('parseOsRelease', function ()
    {
        test('strips surrounding double quotes from values', function ()
        {
            const map = parseOsRelease('NAME="Ubuntu"\nVERSION_ID="22.04"');
            assert.equal(map.NAME, 'Ubuntu', 'both quotes should be stripped, not just the first');
            assert.equal(map.VERSION_ID, '22.04');
        });

        test('strips surrounding single quotes from values', function ()
        {
            const map = parseOsRelease(`NAME='Red Hat Enterprise Linux'\nVERSION_ID='9.4'`);
            assert.equal(map.NAME, 'Red Hat Enterprise Linux');
            assert.equal(map.VERSION_ID, '9.4');
        });

        test('reads unquoted values', function ()
        {
            const map = parseOsRelease('ID=fedora\nVERSION_ID=40');
            assert.equal(map.ID, 'fedora');
            assert.equal(map.VERSION_ID, '40');
        });

        test('tolerates CRLF line endings without leaving a trailing carriage return', function ()
        {
            const map = parseOsRelease('NAME="Ubuntu"\r\nVERSION_ID="22.04"\r\n');
            assert.equal(map.NAME, 'Ubuntu');
            assert.equal(map.VERSION_ID, '22.04', 'trailing \\r must not be included in the version');
        });

        test('keeps values that themselves contain an equals sign', function ()
        {
            const map = parseOsRelease('HOME_URL="https://example.com/?a=b&c=d"');
            assert.equal(map.HOME_URL, 'https://example.com/?a=b&c=d', 'split must occur only on the first "="');
        });

        test('skips blank lines and comments', function ()
        {
            const map = parseOsRelease('# a comment\n\nNAME="Debian GNU/Linux"\n   \n# another comment\nVERSION_ID="12"');
            assert.equal(map.NAME, 'Debian GNU/Linux');
            assert.equal(map.VERSION_ID, '12');
            assert.notProperty(map, '# a comment');
        });

        test('trims surrounding whitespace around keys and values', function ()
        {
            const map = parseOsRelease('  NAME =  "Ubuntu"  ');
            assert.equal(map.NAME, 'Ubuntu');
        });

        test('ignores lines without an equals sign', function ()
        {
            const map = parseOsRelease('NOT_A_PAIR\nNAME="Ubuntu"');
            assert.equal(map.NAME, 'Ubuntu');
            assert.notProperty(map, 'NOT_A_PAIR');
        });

        test('parses a realistic Ubuntu os-release into the correct NAME and VERSION_ID', function ()
        {
            const ubuntu = [
                'PRETTY_NAME="Ubuntu 22.04.4 LTS"',
                'NAME="Ubuntu"',
                'VERSION_ID="22.04"',
                'VERSION="22.04.4 LTS (Jammy Jellyfish)"',
                'VERSION_CODENAME=jammy',
                'ID=ubuntu',
                'ID_LIKE=debian',
                'HOME_URL="https://www.ubuntu.com/"',
            ].join('\n');
            const map = parseOsRelease(ubuntu);
            assert.equal(map.NAME, 'Ubuntu');
            assert.equal(map.VERSION_ID, '22.04');
            assert.equal(map.ID, 'ubuntu');
        });
    });
});
