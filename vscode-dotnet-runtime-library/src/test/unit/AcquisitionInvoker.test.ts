/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as cp from 'child_process';
import { test } from 'mocha';
import { AcquisitionInvoker } from '../../Acquisition/AcquisitionInvoker';
import { DotnetInstall } from '../../Acquisition/DotnetInstall';
import { EventBasedError } from '../../EventStream/EventStreamEvents';
import { ICommandExecutor } from '../../Utils/ICommandExecutor';
import { MockCommandExecutor, MockFileUtilities } from '../mocks/MockObjects';
import { getMockAcquisitionContext, getMockUtilityContext } from './TestUtility';

const assert = chai.assert;

const mockInstall: DotnetInstall = {
    installId: 'test-install',
    version: '8.0.0',
    architecture: 'x64',
    isGlobal: false,
    installMode: 'runtime'
};

/**
 * Thin subclass that exposes protected methods and swaps in MockFileUtilities.
 * The ICommandExecutor is injected via constructor (matching codebase DI pattern).
 */
class TestableAcquisitionInvoker extends AcquisitionInvoker
{
    public mockFileUtils: MockFileUtilities;

    constructor(workerContext: any, utilityContext: any, commandExecutor?: ICommandExecutor)
    {
        super(workerContext, utilityContext, commandExecutor);
        this.mockFileUtils = new MockFileUtilities();
        this.fileUtilities = this.mockFileUtils as any;
    }

    public async testVerifyPowershellCanRun(installId: DotnetInstall): Promise<string>
    {
        return this.verifyPowershellCanRun(installId);
    }

    public async testFindWorkingPowershellViaProbing(installId: DotnetInstall): Promise<string>
    {
        return this.findWorkingPowershellViaProbing(installId);
    }

    public testLooksLikePowershellProcessNotFound(stderr: string, error: cp.ExecException): boolean
    {
        return this.mightBePowershellNotFound(stderr, error);
    }
}

suite('AcquisitionInvoker PowerShell Verification Tests', function ()
{
    this.timeout(15000);

    let invoker: TestableAcquisitionInvoker;
    let mockExecutor: MockCommandExecutor;
    let workerContext: any;
    let utilityContext: any;

    setup(function ()
    {
        workerContext = getMockAcquisitionContext('runtime', '8.0.0');
        utilityContext = getMockUtilityContext();
        mockExecutor = new MockCommandExecutor(workerContext, utilityContext);
        invoker = new TestableAcquisitionInvoker(workerContext, utilityContext, mockExecutor);
    });

    suite('verifyPowershellCanRun', function ()
    {
        test('returns default full path when file exists at well-known location', async function ()
        {
            const expectedPath = `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
            invoker.mockFileUtils.filePathsAndExistValues[expectedPath] = true;

            const result = await invoker.testVerifyPowershellCanRun(mockInstall);
            assert.strictEqual(result, expectedPath);
        });

        test('falls back to probing when file does not exist at default location', async function ()
        {
            invoker.mockFileUtils.exists = async () => false;
            mockExecutor.workingCommandIndex = 0;

            const result = await invoker.testVerifyPowershellCanRun(mockInstall);
            assert.strictEqual(result, 'powershell.exe');
        });
    });

    suite('findWorkingPowershellViaProbing', function ()
    {
        test('returns powershell.exe when first probe succeeds (index 0)', async function ()
        {
            mockExecutor.workingCommandIndex = 0;

            const result = await invoker.testFindWorkingPowershellViaProbing(mockInstall);
            assert.strictEqual(result, 'powershell.exe');
        });

        test('returns pwsh when second probe succeeds (index 1)', async function ()
        {
            mockExecutor.workingCommandIndex = 1;

            const result = await invoker.testFindWorkingPowershellViaProbing(mockInstall);
            assert.strictEqual(result, 'pwsh');
        });

        test('throws DotnetAcquisitionScriptError when no shell works', async function ()
        {
            mockExecutor.workingCommandIndex = null;

            try
            {
                await invoker.testFindWorkingPowershellViaProbing(mockInstall);
                assert.fail('Should have thrown');
            }
            catch (err: any)
            {
                assert.instanceOf(err, EventBasedError);
                assert.include(err.message, 'powershell is not discoverable');
            }
        });

        test('command count matches shell path count exactly', async function ()
        {
            mockExecutor.workingCommandIndex = 1;

            const result = await invoker.testFindWorkingPowershellViaProbing(mockInstall);
            assert.strictEqual(result, 'pwsh',
                'Index 1 should map to pwsh, not powershell.exe');
        });

    });

    suite('mightBePowershellNotFound detects real cp.exec failures', function ()
    {
        test('non-existent shell option produces ENOENT that is detected', function (done)
        {
            cp.exec('echo hello', { shell: 'C:\\definitely-not-real\\powershell.exe' }, (error, stdout, stderr) =>
            {
                assert.isNotNull(error, 'cp.exec should fail with a non-existent shell');
                assert.isTrue(invoker.testLooksLikePowershellProcessNotFound(stderr, error!),
                    `Should detect error code ${(error as any)?.code} as a missing PowerShell`);
                done();
            });
        });

        test('detection + probing recovery works end-to-end', function (done)
        {
            mockExecutor.workingCommandIndex = 1;

            cp.exec('echo hello', { shell: 'C:\\definitely-not-real\\powershell.exe' }, async (error, stdout, stderr) =>
            {
                try
                {
                    assert.isTrue(invoker.testLooksLikePowershellProcessNotFound(stderr, error!),
                        'Should detect the error');

                    const recovered = await invoker.testFindWorkingPowershellViaProbing(mockInstall);
                    assert.strictEqual(recovered, 'pwsh',
                        'Probing should recover by finding pwsh');
                    done();
                }
                catch (err)
                {
                    done(err);
                }
            });
        });
    });
});
