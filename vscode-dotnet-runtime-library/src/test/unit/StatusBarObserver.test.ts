/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { DotnetInstall } from '../../Acquisition/DotnetInstall';
import {
    DotnetAcquisitionCompleted,
    DotnetAcquisitionFinalError,
    DotnetAcquisitionStarted,
    DotnetInstallCancelledByUserError,
    EventBasedError,
} from '../../EventStream/EventStreamEvents';
import { StatusBarObserver } from '../../EventStream/StatusBarObserver';

const assert = chai.assert;
const defaultTimeoutTime = 5000;

class MockStatusBarItem
{
    public text = '';
    public command: string | undefined = undefined;
    public color: string | undefined = undefined;
    public tooltip: string | undefined = undefined;
    public isVisible = false;

    public show(): void
    {
        this.isVisible = true;
    }

    public hide(): void
    {
        this.isVisible = false;
    }
}

const makeInstall = (id: string): DotnetInstall => ({
    version: id,
    isGlobal: false,
    architecture: 'x64',
    installId: id,
    installMode: 'runtime',
});

suite('StatusBarObserver Unit Tests', function ()
{
    const showLogCommand = 'dotnet.showLog';
    let mockStatusBarItem: MockStatusBarItem;
    let observer: StatusBarObserver;

    setup(() =>
    {
        mockStatusBarItem = new MockStatusBarItem();
        // Cast to any to avoid needing the full vscode.StatusBarItem interface
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        observer = new StatusBarObserver(mockStatusBarItem as any, showLogCommand);
    });

    test('Status bar shows when acquisition starts', () =>
    {
        const install = makeInstall('8.0~x64');
        observer.post(new DotnetAcquisitionStarted(install, 'test-ext'));

        assert.isTrue(mockStatusBarItem.isVisible, 'Status bar should be visible after acquisition starts');
        assert.include(mockStatusBarItem.text, 'Downloading .NET', 'Status bar should display downloading text');
    }).timeout(defaultTimeoutTime);

    test('Status bar hides when single acquisition completes', () =>
    {
        const install = makeInstall('8.0~x64');
        observer.post(new DotnetAcquisitionStarted(install, 'test-ext'));
        observer.post(new DotnetAcquisitionCompleted(install, '/path/to/dotnet', '8.0'));

        assert.isFalse(mockStatusBarItem.isVisible, 'Status bar should be hidden after acquisition completes');
    }).timeout(defaultTimeoutTime);

    test('Status bar stays visible when one of multiple concurrent downloads completes', () =>
    {
        const installA = makeInstall('8.0~x64');
        const installB = makeInstall('9.0~x64');

        observer.post(new DotnetAcquisitionStarted(installA, 'test-ext'));
        observer.post(new DotnetAcquisitionStarted(installB, 'test-ext'));

        // Complete the first download - status bar should remain visible because B is still in progress
        observer.post(new DotnetAcquisitionCompleted(installA, '/path/to/dotnet', '8.0'));

        assert.isTrue(mockStatusBarItem.isVisible, 'Status bar should remain visible while other downloads are in progress');
    }).timeout(defaultTimeoutTime);

    test('Status bar hides only after all concurrent downloads complete', () =>
    {
        const installA = makeInstall('8.0~x64');
        const installB = makeInstall('9.0~x64');

        observer.post(new DotnetAcquisitionStarted(installA, 'test-ext'));
        observer.post(new DotnetAcquisitionStarted(installB, 'test-ext'));

        observer.post(new DotnetAcquisitionCompleted(installA, '/path/to/dotnet', '8.0'));
        assert.isTrue(mockStatusBarItem.isVisible, 'Status bar should remain visible after first of two downloads completes');

        observer.post(new DotnetAcquisitionCompleted(installB, '/path/to/dotnet', '9.0'));
        assert.isFalse(mockStatusBarItem.isVisible, 'Status bar should hide after all downloads complete');
    }).timeout(defaultTimeoutTime);

    test('Status bar hides when acquisition is aborted', () =>
    {
        const install = makeInstall('8.0~x64');
        observer.post(new DotnetAcquisitionStarted(install, 'test-ext'));

        const abortError = new EventBasedError('TestAbort', 'Installation cancelled');
        observer.post(new DotnetInstallCancelledByUserError(abortError, install));

        assert.isFalse(mockStatusBarItem.isVisible, 'Status bar should hide when acquisition is aborted');
    }).timeout(defaultTimeoutTime);

    test('Status bar hides when final error occurs for single download', () =>
    {
        const install = makeInstall('8.0~x64');
        observer.post(new DotnetAcquisitionStarted(install, 'test-ext'));

        const finalError = new DotnetAcquisitionFinalError(new EventBasedError('TestError', 'Download failed'), 'TestEvent', install);
        observer.post(finalError);

        assert.isFalse(mockStatusBarItem.isVisible, 'Status bar should hide when acquisition fails with final error');
    }).timeout(defaultTimeoutTime);

    test('Status bar stays visible when one of multiple concurrent downloads fails with final error', () =>
    {
        const installA = makeInstall('8.0~x64');
        const installB = makeInstall('9.0~x64');

        observer.post(new DotnetAcquisitionStarted(installA, 'test-ext'));
        observer.post(new DotnetAcquisitionStarted(installB, 'test-ext'));

        const finalError = new DotnetAcquisitionFinalError(new EventBasedError('TestError', 'Download failed'), 'TestEvent', installA);
        observer.post(finalError);

        assert.isTrue(mockStatusBarItem.isVisible, 'Status bar should remain visible when one download fails but another is still in progress');
    }).timeout(defaultTimeoutTime);

    test('Status bar hides correctly when same installId is started twice (duplicate request)', () =>
    {
        // Simulates the global SDK path where DotnetAcquisitionStarted fires before the inner lock,
        // so two extensions requesting the same version can each trigger a start event.
        const install = makeInstall('8.0~x64');
        observer.post(new DotnetAcquisitionStarted(install, 'ext-csharp'));
        observer.post(new DotnetAcquisitionStarted(install, 'ext-csharpdk'));

        assert.isTrue(mockStatusBarItem.isVisible, 'Status bar should be visible after duplicate starts');

        // Only one completion fires (the actual install)
        observer.post(new DotnetAcquisitionCompleted(install, '/path/to/dotnet', '8.0'));

        assert.isFalse(mockStatusBarItem.isVisible, 'Status bar should hide after completion even with duplicate starts');
    }).timeout(defaultTimeoutTime);

    test('Status bar handles completion for unknown installId gracefully', () =>
    {
        const installA = makeInstall('8.0~x64');
        const installB = makeInstall('9.0~x64');

        // Only start A
        observer.post(new DotnetAcquisitionStarted(installA, 'test-ext'));

        // Complete B (never started) - should not crash or affect status bar
        observer.post(new DotnetAcquisitionCompleted(installB, '/path/to/dotnet', '9.0'));

        assert.isTrue(mockStatusBarItem.isVisible, 'Status bar should remain visible since A is still in progress');
    }).timeout(defaultTimeoutTime);

    test('Status bar handles duplicate start with mixed completion and error', () =>
    {
        const install = makeInstall('8.0~x64');
        const otherInstall = makeInstall('9.0~x64');

        observer.post(new DotnetAcquisitionStarted(install, 'ext-a'));
        observer.post(new DotnetAcquisitionStarted(install, 'ext-b'));
        observer.post(new DotnetAcquisitionStarted(otherInstall, 'ext-c'));

        // Error on the duplicate - should remove it from tracking
        const finalError = new DotnetAcquisitionFinalError(new EventBasedError('TestError', 'Failed'), 'TestEvent', install);
        observer.post(finalError);

        assert.isTrue(mockStatusBarItem.isVisible, 'Status bar should remain visible since 9.0 is still in progress');

        // Complete the other install
        observer.post(new DotnetAcquisitionCompleted(otherInstall, '/path/to/dotnet', '9.0'));

        assert.isFalse(mockStatusBarItem.isVisible, 'Status bar should hide after all unique installs complete');
    }).timeout(defaultTimeoutTime);
});
