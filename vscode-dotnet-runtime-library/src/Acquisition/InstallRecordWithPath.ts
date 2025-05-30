/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { InstallRecord } from './InstallRecord';

/**
 * Represents a .NET installation record along with its filesystem path
 */
export interface InstallRecordWithPath
{
    installRecord: InstallRecord;
    path: string;
}