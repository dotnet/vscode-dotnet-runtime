/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { isNullOrUndefined } from "util";
 import * as semver from 'semver';

export abstract class IVersionResolver {
    abstract resolveVersion(version: string): Promise<string>;

    protected validateVersionInput(version: string) {
        const parsedVer = semver.coerce(version);
        if (version.split('.').length != 2 || isNullOrUndefined(parsedVer)) {
            throw new Error('Invalid version: ' + version);
        }
    }
}