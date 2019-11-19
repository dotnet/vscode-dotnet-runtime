/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { VersionResolver } from "../../VersionResolver";
var chai = require('chai');
var assert = chai.assert;
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);

suite("VersionResolver Unit Tests", function () {
    const resolver: VersionResolver = new VersionResolver();

    test("Error With Invalid Version", async () => {
        return assert.isRejected(resolver.resolveVersion("foo"), Error, 'Invalid version');
    });

    test("Error With Patch Number", async () => {
        return assert.isRejected(resolver.resolveVersion("1.0.16"), Error, 'Invalid version');
    });

    test("Error With Version Out of Range", async () => {
        return assert.isRejected(resolver.resolveVersion("0.0"), Error, 'Unable to resolve version');
    });
});