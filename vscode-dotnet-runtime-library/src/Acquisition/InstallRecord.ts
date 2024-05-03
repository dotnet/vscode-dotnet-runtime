/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetInstall } from './DotnetInstall';

/**
 * @remarks
 * The string containing the extensionid of the extension which requested the install.
 * 'user' if the user installed it themselves.
 * null if we don't know because the install was done before we kept track of these things.
 * It can also be null if the install was done by an external source ...
 * including a different user on the machine through our extension. (they should manage it.)
 */
export type InstallOwner = string | null;

/**
 * @remarks
 * Records to save between extension loads to know who owns what installs and which ones exist.
 * Some of the types exist due to a need to support existing installs before this type existed.
 * All discovered old installs should be replaced with the new type.
 */
export interface InstallRecord
{
    dotnetInstall: DotnetInstall;
    installingExtensions: InstallOwner[];
}


// we might be able to get rid of this
/**
 * @remarks
 * The record can be the type or it can be a 'legacy' record from old installs which is just a string with the install key.
 */
export type InstallRecordOrStr = InstallRecord | string;