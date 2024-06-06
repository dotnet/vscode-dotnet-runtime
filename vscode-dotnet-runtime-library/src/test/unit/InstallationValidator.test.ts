/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/
import * as chai from 'chai';
import { InstallationValidator } from '../../Acquisition/InstallationValidator';
import { MockEventStream } from '../mocks/MockObjects';
import * as os from 'os';
import { GetDotnetInstallInfo } from '../../Acquisition/DotnetInstall';

const assert = chai.assert;

suite('InstallationValidator Unit Tests', () => {
    const eventStream = new MockEventStream();
    const validator = new InstallationValidator(eventStream);

    test('Error With Invalid File Structure', async () => {
        const install = GetDotnetInstallInfo('7.0', 'runtime', false, os.arch());
        assert.throws(() => validator.validateDotnetInstall(install, ''), `Validation of .dotnet installation for version`);
        assert.throws(() => validator.validateDotnetInstall(install, ''), `fail`);
    });
});
