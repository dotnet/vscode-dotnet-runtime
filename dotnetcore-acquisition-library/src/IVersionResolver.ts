/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { ReleasesResult } from "./ReleasesResult";

export interface IVersionResolver {
    resolveVersion(version: string, releases: ReleasesResult): string;
    getReleasesResult(): Promise<ReleasesResult>
}