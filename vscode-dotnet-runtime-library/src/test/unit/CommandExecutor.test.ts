import * as chai from 'chai';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { CommandExecutor } from '../../Utils/CommandExecutor';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';

const assert = chai.assert;

suite('CommandExecutor Shell Behavior', function ()
{
    this.timeout(15000);
    let root: string;
    let startup: string;
    let executor: CommandExecutor;
    let environment: NodeJS.ProcessEnv;
    const query = '"${PROBE_PROFILE-unset}|${PROBE_RC-unset}|${PROBE_ENV-unset}"';

    setup(async () =>
    {
        root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dotnet-executor-test-'));
        startup = path.join(root, 'startup');
        await fs.promises.writeFile(startup, 'export PROBE_ENV=loaded\n');
        await fs.promises.writeFile(path.join(root, '.bashrc'), 'export PROBE_RC=loaded\n');
        await fs.promises.writeFile(path.join(root, '.profile'), 'export PROBE_PROFILE=loaded\n');
        await fs.promises.writeFile(path.join(root, '.bash_profile'), 'export PROBE_PROFILE=loaded\n');
        environment = { HOME: root, PATH: '/usr/bin:/bin', LANG: 'C', BASH_ENV: startup, ENV: startup };
        executor = new CommandExecutor(getMockAcquisitionContext('runtime', '10.0'), getMockUtilityContext());
    });

    teardown(async () =>
    {
        await fs.promises.rm(root, { recursive: true, force: true });
    });

    test('shell false still interprets commands because execute uses Node exec', async () =>
    {
        const result = await executor.execute(CommandExecutor.makeCommand('echo', ['first', '&&', 'echo', 'second']),
            { cwd: root, shell: false, timeout: 10000 });
        assert.strictEqual(result.status, '0');
        assert.match(result.stdout, /first\s+second/);
    });

    test('default Unix execution ignores SHELL and uses sh without login or interactive flags', async function ()
    {
        if (os.platform() === 'win32')
        {
            this.skip();
        }
        const result = await executor.execute(CommandExecutor.makeCommand('printf', ["'%s\\n'", '"$0"', '"$-"']),
            { cwd: root, env: { ...environment, SHELL: '/nonexistent/shell' }, timeout: 10000 });
        const lines = result.stdout.trim().split('\n');
        assert.strictEqual(lines[0], '/bin/sh');
        assert.notInclude(lines[1] ?? '', 'i');
        assert.strictEqual(result.status, '0');
    });

    test('default dash or Bash-as-sh does not load the isolated startup files', async function ()
    {
        if (os.platform() === 'win32' || !['dash', 'bash'].includes(path.basename(await fs.promises.realpath('/bin/sh'))))
        {
            this.skip();
        }
        const result = await executor.execute(CommandExecutor.makeCommand('printf', ["'%s'", query]),
            { cwd: root, env: environment, timeout: 10000 });
        assert.strictEqual(result.stdout, 'unset|unset|unset');
    });

    test('explicit Bash loads BASH_ENV at inherited SHLVL 1 without loading login profiles', async function ()
    {
        if (os.platform() === 'win32' || !fs.existsSync('/bin/bash'))
        {
            this.skip();
        }
        const options = { cwd: root, env: { ...environment, SHLVL: '1' }, shell: '/bin/bash', timeout: 10000 };
        const result = await executor.execute(CommandExecutor.makeCommand('printf', ["'%s'", query]), options);
        assert.strictEqual(result.stdout, 'unset|unset|loaded');
        const directBash = await promisify(execFile)('/bin/bash', ['-c', `printf '%s' ${query}`],
            { cwd: root, env: options.env, shell: false, timeout: 10000 });
        assert.strictEqual(directBash.stdout, result.stdout);
    });

    test('explicit Bash loads bashrc with Node piped stdin when inherited SHLVL is zero on Linux', async function ()
    {
        if (os.platform() !== 'linux' || !fs.existsSync('/bin/bash'))
        {
            this.skip();
        }
        const options = { cwd: root, env: { ...environment, SHLVL: '0' }, shell: '/bin/bash', timeout: 10000 };
        const result = await executor.execute(CommandExecutor.makeCommand('printf', ["'%s'", query]), options);
        assert.strictEqual(result.stdout, 'unset|loaded|unset', 'Bash network-stdin startup branch: see Documentation/investigations/shell-execution.md');
        const directBash = await promisify(execFile)('/bin/bash', ['-c', `printf '%s' ${query}`],
            { cwd: root, env: options.env, shell: false, timeout: 10000 });
        assert.strictEqual(directBash.stdout, result.stdout);
    });

    test('direct native execution inherits supplied variables without sourcing BASH_ENV', async () =>
    {
        const result = await promisify(execFile)(process.execPath,
            ['-p', 'JSON.stringify({startup:process.env.PROBE_ENV || "unset",inherited:process.env.PROBE_INHERITED})'],
            {
                cwd: root, shell: false, timeout: 10000, env: {
                    ...process.env, ...environment,
                    PROBE_ENV: '', PROBE_INHERITED: 'retained', ELECTRON_RUN_AS_NODE: '1'
                }
            });
        assert.deepEqual(JSON.parse(result.stdout), { startup: 'unset', inherited: 'retained' });
    });

});