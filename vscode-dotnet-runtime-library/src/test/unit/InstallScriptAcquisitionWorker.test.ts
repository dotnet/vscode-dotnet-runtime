/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import * as os from 'os';

import { IInstallScriptAcquisitionWorker } from '../../Acquisition/IInstallScriptAcquisitionWorker';
import { InstallScriptAcquisitionWorker } from '../../Acquisition/InstallScriptAcquisitionWorker';
import
{
    DotnetFallbackInstallScriptUsed,
    DotnetInstallScriptAcquisitionCompleted,
    DotnetInstallScriptAcquisitionError,
} from '../../EventStream/EventStreamEvents';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import
{
    MockEventStream,
    MockInstallScriptWorker,
} from '../mocks/MockObjects';
import { getMockAcquisitionContext } from './TestUtility';

const assert = chai.assert;
chai.use(chaiAsPromised);

const maxTimeoutTime = 10000;

suite('InstallScriptAcquisitionWorker Unit Tests', function ()
{
    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    test('Successful script acquisition from web', async () =>
    {
        const eventStream = new MockEventStream();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(
            getMockAcquisitionContext('runtime', '7.0', undefined, eventStream),
            false // not failing
        );

        const scriptPath = await installScriptWorker.getDotnetInstallScriptPath();

        assert.exists(scriptPath);
        assert.isTrue(scriptPath.length > 0);
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionCompleted));
    }).timeout(maxTimeoutTime);

    test('Web request failure triggers fallback to bundled script', async () =>
    {
        const eventStream = new MockEventStream();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(
            getMockAcquisitionContext('runtime', '7.0', undefined, eventStream),
            true, // failing
            true  // has fallback
        );

        const scriptPath = await installScriptWorker.getDotnetInstallScriptPath();

        assert.exists(scriptPath);
        assert.isTrue(scriptPath.length > 0);

        // Verify events were posted for both failure and fallback usage
        assert.exists(eventStream.events.find(event => event instanceof DotnetInstallScriptAcquisitionError));
        assert.exists(eventStream.events.find(event => event instanceof DotnetFallbackInstallScriptUsed));
    }).timeout(maxTimeoutTime);

    test('Bundled fallback script is valid and exists', async () =>
    {
        const eventStream = new MockEventStream();
        const installScriptWorker = new InstallScriptAcquisitionWorker(
            getMockAcquisitionContext('runtime', '7.0', undefined, eventStream)
        );

        const expectedScriptPath = await installScriptWorker.getDotnetInstallScriptPath();

        assert.isTrue(fs.existsSync(expectedScriptPath), `Bundled script should exist at: ${expectedScriptPath}`);

        // Verify the file is readable
        const stats = fs.statSync(expectedScriptPath);
        assert.isTrue(stats.isFile(), 'Bundled script should be a file');
        assert.isTrue(stats.size > 0, 'Bundled script should not be empty');

        // Verify it has appropriate permissions on Unix systems
        if (os.platform() !== 'win32')
        {
            const mode = stats.mode;
            // Check if owner has read permission (at minimum)
            assert.isTrue((mode & parseInt('400', 8)) !== 0, 'Script should be readable by owner');
        }
    }).timeout(maxTimeoutTime);

    test('Web request failure without valid fallback throws error', async () =>
    {
        const eventStream = new MockEventStream();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(
            getMockAcquisitionContext('runtime', '7.0', undefined, eventStream),
            true, // failing
            false // no fallback
        );

        await assert.isRejected(installScriptWorker.getDotnetInstallScriptPath());
    }).timeout(maxTimeoutTime);

    test('Multiple calls to get script path should be idempotent', async () =>
    {
        const eventStream = new MockEventStream();
        const installScriptWorker: IInstallScriptAcquisitionWorker = new MockInstallScriptWorker(
            getMockAcquisitionContext('runtime', '7.0', undefined, eventStream),
            false // not failing
        );

        const firstPath = await installScriptWorker.getDotnetInstallScriptPath();
        const secondPath = await installScriptWorker.getDotnetInstallScriptPath();

        assert.equal(firstPath, secondPath, 'Multiple calls should return the same path');

        // Should have at least one completion event (could be cached on second call)
        const completionEvents = eventStream.events.filter(event => event instanceof DotnetInstallScriptAcquisitionCompleted);
        assert.isTrue(completionEvents.length >= 1, 'Should have at least one completion event');
    }).timeout(maxTimeoutTime);
});