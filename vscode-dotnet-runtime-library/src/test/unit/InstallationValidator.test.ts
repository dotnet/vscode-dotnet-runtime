/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import * as os from 'os';
import { GetDotnetInstallInfo } from '../../Acquisition/DotnetInstall';
import { InstallationValidator } from '../../Acquisition/InstallationValidator';
import { LocalMemoryCacheSingleton } from '../../LocalMemoryCacheSingleton';
import { WebRequestWorkerSingleton } from '../../Utils/WebRequestWorkerSingleton';
import { MockEventStream } from '../mocks/MockObjects';

const assert = chai.assert;

suite('InstallationValidator Unit Tests', function ()
{
    this.afterEach(async () =>
    {
        // Tear down tmp storage for fresh run
        WebRequestWorkerSingleton.getInstance().destroy();
        LocalMemoryCacheSingleton.getInstance().invalidate();
    });

    const eventStream = new MockEventStream();
    const validator = new InstallationValidator(eventStream);

    test('Error With Invalid File Structure', async () =>
    {
        const install = GetDotnetInstallInfo('7.0', 'runtime', 'local', os.arch());
        assert.throws(() => validator.validateDotnetInstall(install, ''), `Validation of .dotnet installation for version`);
        assert.throws(() => validator.validateDotnetInstall(install, ''), `fail`);
    });
});
