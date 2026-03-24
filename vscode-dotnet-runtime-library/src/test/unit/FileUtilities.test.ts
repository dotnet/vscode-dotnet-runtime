/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as os from 'os';
import { FileUtilities } from '../../Utils/FileUtilities';
import { MockEventStream } from '../mocks/MockObjects';

const assert = chai.assert;

suite('FileUtilities Unit Tests', function ()
{
    this.timeout(15000);

    suite('fileIsOpen', function ()
    {
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
    });
});
