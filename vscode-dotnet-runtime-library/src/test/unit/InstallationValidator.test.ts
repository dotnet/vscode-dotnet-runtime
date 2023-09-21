/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/import * as chai from 'chai';
import { InstallationValidator } from '../../Acquisition/InstallationValidator';
import { MockEventStream } from '../mocks/MockObjects';
const assert = chai.assert;

suite('InstallationValidator Unit Tests', () => {
    const eventStream = new MockEventStream();
    const validator = new InstallationValidator(eventStream);

    test('Error With Invalid File Structure', async () => {
        assert.throws(() => validator.validateDotnetInstall('', ''), `Validation of .dotnet installation for version  failed:`);
    });
});
