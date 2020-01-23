/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as chai from 'chai';
import { InstallationValidator } from '../../InstallationValidator';
import { MockEventStream } from '../mocks/MockObjects';
const assert = chai.assert;

suite('InstallationValidator Unit Tests', () => {
    const eventStream = new MockEventStream();
    const validator = new InstallationValidator(eventStream);

    test('Error With Invalid File Structure', async () => {
        assert.throws(() => validator.validateDotnetInstall('', ''), `Validation of .dotnet installation for version  failed:`);
    });
});
