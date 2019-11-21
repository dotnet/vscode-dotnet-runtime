/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { versionPairs, MockVersionResolver } from "../mocks/MockObjects";
import { ReleasesResult } from "../../ReleasesResult";
var assert = require('chai').assert;

suite("VersionResolver Unit Tests", function () {
    // MockVersionResolver is a VersionResolver that uses a fake releases.json 
    // (prevents us from making web requests in unit tests)
    const resolver: MockVersionResolver = new MockVersionResolver(); 
    var releases: ReleasesResult;

    test("Get Releases Results", async () => {
        releases = await resolver.getReleasesResult();
        assert.exists(releases);
    });

    test("Error With Invalid Versions", async () => {
        assert.throws(() => resolver.resolveVersion("foo", releases), Error, 'Invalid version');
        assert.throws(() => resolver.resolveVersion("1.0.16", releases), Error, 'Invalid version');
        assert.throws(() => resolver.resolveVersion("0.0", releases), Error, 'Unable to resolve version');
    });

    test("Resolve Valid Versions", async () => {
        for (var version of versionPairs) {
            assert.equal(await resolver.resolveVersion(version[0], releases), version[1]);
        }
    });
});