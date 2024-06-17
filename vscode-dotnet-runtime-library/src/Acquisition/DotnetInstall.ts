/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { DotnetInstallType } from '..';
import { DotnetCoreAcquisitionWorker } from './DotnetCoreAcquisitionWorker';
import { DotnetInstallMode } from './DotnetInstallMode';

export interface DotnetInstall {
    installKey: string;
    version: string;
    architecture: string;
    isGlobal: boolean;
    installMode: DotnetInstallMode;
}

/**
 * @remarks
 * The key can be a type containing all of the information or the 'legacy' key which is a string that contains all of the information.
 */
export type DotnetInstallOrStr = DotnetInstall | string;

/**
 *
 * @returns True if the underlying installs are the exact same 'files'.
 * An 'install' is technically marked on disk by its install key.
 * The key could theoretically be temporarily shared between installs that are not the same underlying files.
 * For example, if the install key becomes '8', then '8' could at one point hold 8.0.100, then later 8.0.200.
 * That is not the case at the moment, but it is a possibility.
 * Think carefully between using this and IsEquivalentInstallation
 */
export function IsEquivalentInstallationFile(a: DotnetInstall, b: DotnetInstall): boolean {
    return a.version === b.version && a.architecture === b.architecture &&
        a.isGlobal === b.isGlobal && a.installMode === b.installMode;
}

/**
 *
 * @returns true if A and B are can be treated as the same install.
 * This does not mean they have the same files on disk or version, just that they should be managed as the same install.
 * (e.g. auto updating the '8.0' install.)
 * Think carefully between using this and IsEquivalentInstallationFile. There is no difference between the two *yet*
 */
export function IsEquivalentInstallation(a: DotnetInstall, b: DotnetInstall): boolean {
    return a.installKey === b.installKey;
}

/**
 * @returns A string set representing the installation of either a .NET runtime or .NET SDK.
 */
export function InstallToStrings(key: DotnetInstall | null) {
    if (!key) {
        return { installKey: '', version: '', architecture: '', isGlobal: '', installMode: '' };
    }

    return {
        installKey: key.installKey,
        version: key.version,
        architecture: key.architecture,
        isGlobal: key.isGlobal.toString(),
        installMode: key.installMode.toString()
    };
}

export function looksLikeRuntimeVersion(version: string): boolean {
    const band: string | undefined = version.split('.')?.at(2);
    return !band || band.length <= 2; // assumption : there exists no runtime version at this point over 99 sub versions
}

export function GetDotnetInstallInfo(installVersion: string, installationMode: DotnetInstallMode, installType: DotnetInstallType, installArchitecture: string): DotnetInstall
{
    return {
        installKey: DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(installVersion, installArchitecture, installType),
        version: installVersion,
        architecture: installArchitecture,
        isGlobal: installType === 'global',
        installMode: installationMode,
    } as DotnetInstall;
}