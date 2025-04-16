/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetInstall } from './DotnetInstall';
import { IInstallationDirectoryProvider } from './IInstallationDirectoryProvider';


/*
* @remarks Hold this when using an installer that impacts the entire system state (not just user local state.)
* This lock is unaware of external programs running MSIs that may conflict and also edit the global machine state.
* But, it at least prevents the extension from tripping over itself.
*/
export function GLOBAL_INSTALL_STATE_MODIFIER_LOCK(directoryProvider: IInstallationDirectoryProvider, install: DotnetInstall): string
{
    return 'vscdGlLk';
}

export function RUN_UNDER_SUDO_LOCK(sudoDirectory: string): string
{
    return 'vscdSudoLk';
}

export const UNABLE_TO_ACQUIRE_GLOBAL_LOCK_ERR = '898998';

export const UBUNTU_DISTRO_INFO_KEY = 'Ubuntu';
export const RED_HAT_DISTRO_INFO_KEY = 'Red Hat Enterprise Linux';
export const DEBIAN_DISTRO_INFO_KEY = 'Debian GNU/Linux';