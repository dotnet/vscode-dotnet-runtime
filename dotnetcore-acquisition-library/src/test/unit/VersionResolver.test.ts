/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { versionPairs, MockVersionResolver } from "./MockObjects";
var chai = require('chai');
var assert = chai.assert;
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

suite("VersionResolver Unit Tests", function () {
    // MockVersionResolver is a VersionResolver that uses a fake releases.json 
    // (prevents us from making web requests in unit tests)
    const resolver: MockVersionResolver = new MockVersionResolver(); 

    test("Error With Invalid Version", async () => {
        return assert.isRejected(resolver.resolveVersion("foo"), Error, 'Invalid version');
    });

    test("Error With Patch Number", async () => {
        return assert.isRejected(resolver.resolveVersion("1.0.16"), Error, 'Invalid version');
    });

    test("Error With Version Out of Range", async () => {
        return assert.isRejected(resolver.resolveVersion("0.0"), Error, 'Unable to resolve version');
    });

    test("Resolve Valid Versions", async () => {
        for (var version of versionPairs) {
            assert.equal(await resolver.resolveVersion(version[0]), version[1]);
        }
    });
});