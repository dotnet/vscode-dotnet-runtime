/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import { mock } from 'node:test';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { FileUtilities } from '../../Utils/FileUtilities';
import { getDotnetExecutable } from '../../Utils/TypescriptUtilities';
import { MockEventStream } from '../mocks/MockObjects';

const assert = chai.assert;

suite('FileUtilities Unit Tests', function ()
{
    this.timeout(15000);

    suite('fileIsOpen', function ()
    {
        suite('lsof results', function ()
        {
            const filePath = '-file with spaces;$(literal)';
            const originalExecFile = childProcess.execFile;
            let eventStream: MockEventStream;

            setup(() =>
            {
                eventStream = new MockEventStream();
                mock.method(os, 'platform', () => 'linux');
                mock.method(fs.promises, 'access', async () => {});
            });

            teardown(() =>
            {
                Object.defineProperty(childProcess, 'execFile', { value: originalExecFile });
                mock.restoreAll();
            });

            function mockLsof(error: Error | null, stdout = '', stderr = '')
            {
                const execution = mock.fn(async (...args: unknown[]) =>
                {
                    if (error)
                    {
                        throw Object.assign(error, { stdout, stderr });
                    }
                    return { stdout, stderr };
                });
                Object.defineProperty(childProcess, 'execFile', {
                    value: Object.assign(() => {}, { [promisify.custom]: execution }),
                });
                return execution;
            }

            test('passes a literal filename after the option delimiter and suppresses unrelated filesystem warnings', async () =>
            {
                const execution = mockLsof(Object.assign(new Error('no matches'), { code: 1 }));
                assert.isFalse(await FileUtilities.fileIsOpen(filePath, eventStream));
                assert.strictEqual(execution.mock.calls.length, 1);
                assert.strictEqual(execution.mock.calls[0].arguments[0], 'lsof');
                assert.deepEqual(execution.mock.calls[0].arguments[1], ['-n', '-w', '--', filePath]);
                assert.deepEqual(execution.mock.calls[0].arguments[2], { timeout: 10000, shell: false });
            });

            test('reports open handles as busy', async () =>
            {
                mockLsof(null, 'COMMAND PID\ndotnet 123\n');
                assert.isTrue(await FileUtilities.fileIsOpen(filePath, eventStream));
                assert.isTrue(eventStream.events.some(event => event.eventName === 'FileIsBusy'));
            });

            test('accepts a quiet exit 1 as no matches', async () =>
            {
                mockLsof(Object.assign(new Error('no matches'), { code: 1 }));
                assert.isFalse(await FileUtilities.fileIsOpen(filePath, eventStream));
                assert.isTrue(eventStream.events.some(event => event.eventName === 'FileIsNotBusy'));
            });

            test('accepts successful empty output as no handles', async () =>
            {
                mockLsof(null);
                assert.isFalse(await FileUtilities.fileIsOpen(filePath, eventStream));
            });

            for (const failure of [
                { name: 'missing lsof', code: 'ENOENT' },
                { name: 'permission denied', code: 'EACCES' },
                { name: 'unexpected exit', code: 2 },
                { name: 'timeout', code: null, killed: true },
                { name: 'signal', code: null, signal: 'SIGTERM' },
                { name: 'unknown failure' },
            ])
            {
                test(`presumes busy for ${failure.name}`, async () =>
                {
                    mockLsof(Object.assign(new Error(failure.name), failure));
                    assert.isTrue(await FileUtilities.fileIsOpen(filePath, eventStream));
                    assert.isTrue(eventStream.events.some(event => event.eventName === 'FileIsBusy'));
                    assert.isFalse(eventStream.events.some(event => event.eventName === 'FileIsNotBusy'));
                });
            }

            test('presumes busy for exit 1 with diagnostics', async () =>
            {
                mockLsof(Object.assign(new Error('incomplete'), { code: 1 }), '', 'cannot stat filesystem');
                assert.isTrue(await FileUtilities.fileIsOpen(filePath, eventStream));
            });

            test('does not discard partial output on exit 1', async () =>
            {
                mockLsof(Object.assign(new Error('partial'), { code: 1 }), 'COMMAND PID\ndotnet 123\n');
                assert.isTrue(await FileUtilities.fileIsOpen(filePath, eventStream));
            });

            test('presumes busy for successful but incomplete output', async () =>
            {
                mockLsof(null, '', 'output information may be incomplete');
                assert.isTrue(await FileUtilities.fileIsOpen(filePath, eventStream));
            });

            test('presumes busy when process invocation throws synchronously', async () =>
            {
                mockLsof(null).mock.mockImplementation(() => { throw new Error('spawn failed'); });
                assert.isTrue(await FileUtilities.fileIsOpen(filePath, eventStream));
            });

            test('does not mistake filesystem access failure for a missing file', async () =>
            {
                mock.method(fs.promises, 'access', async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); });
                const execution = mockLsof(null);
                assert.isTrue(await FileUtilities.fileIsOpen(filePath, eventStream));
                assert.strictEqual(execution.mock.calls.length, 0);
                assert.isFalse(eventStream.events.some(event => event.eventName === 'FileIsNotBusy'));
            });

            test('preserves an installation when lsof is unavailable during cleanup', async () =>
            {
                const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dotnet-cleanup-test-'));
                const host = path.join(directory, getDotnetExecutable());
                try
                {
                    await fs.promises.writeFile(host, 'preserve');
                    mockLsof(Object.assign(new Error('missing lsof'), { code: 'ENOENT' }));
                    await new FileUtilities().wipeDirectory(directory, eventStream, undefined, true);
                    assert.strictEqual(await fs.promises.readFile(host, 'utf8'), 'preserve');
                }
                finally
                {
                    await fs.promises.rm(directory, { recursive: true, force: true });
                }
            });
        });

        test('returns false for a non-existent file path', async function ()
        {
            // Non-existent files hit the async fs.promises.access guard
            // and return false without spawning lsof or opening a handle.
            const result = await FileUtilities.fileIsOpen('/tmp/dotnet-test-nonexistent-file-abc123xyz');
            assert.isFalse(result, 'fileIsOpen should return false for a file that does not exist');
        });

        test('posts FileIsNotBusy event for a non-existent file', async function ()
        {
            const eventStream = new MockEventStream();
            await FileUtilities.fileIsOpen('/tmp/dotnet-test-nonexistent-file-abc123xyz', eventStream);

            const notBusyEvents = eventStream.events.filter(
                (e) => e.eventName === 'FileIsNotBusy'
            );
            assert.isAbove(notBusyEvents.length, 0,
                'Should post FileIsNotBusy event for a non-existent file');
        });

        test('does not post FileIsBusy event for a non-existent file', async function ()
        {
            const eventStream = new MockEventStream();
            await FileUtilities.fileIsOpen('/tmp/dotnet-test-nonexistent-file-abc123xyz', eventStream);

            const busyEvents = eventStream.events.filter(
                (e) => e.eventName === 'FileIsBusy'
            );
            assert.strictEqual(busyEvents.length, 0,
                'Should not post FileIsBusy event for a non-existent file');
        });

        test('returns false on Windows for a non-existent file via ENOENT', async function ()
        {
            if (os.platform() !== 'win32')
            {
                this.skip();
            }
            // On Windows, non-existent files are now caught by the
            // platform-agnostic fs.promises.access guard at the top.
            const result = await FileUtilities.fileIsOpen('C:\\nonexistent\\dotnet-test-abc123.exe');
            assert.isFalse(result, 'fileIsOpen should return false for a non-existent file on Windows');
        });

        test('passes Unix file paths to lsof without shell interpretation', async function ()
        {
            if (os.platform() === 'win32')
            {
                this.skip();
            }

            const uniqueName = `dotnet-file-open-${process.pid}-${Date.now()}`;
            const markerPath = path.resolve(`${uniqueName}-marker`);
            const filePath = path.join(os.tmpdir(), `${uniqueName};touch ${path.basename(markerPath)}`);

            try
            {
                await fs.promises.writeFile(filePath, '');
                await FileUtilities.fileIsOpen(filePath);

                assert.isFalse(fs.existsSync(markerPath), 'The file path must not be interpreted by a shell');
            }
            finally
            {
                await fs.promises.rm(filePath, { force: true });
                await fs.promises.rm(markerPath, { force: true });
            }
        });
    });
});
