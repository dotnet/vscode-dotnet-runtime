/**
 * Extracts the version from a dotnet install path or install id.
 * Handles Windows, Linux, and legacy install ids.
 * Example path: C:\Users\user\...\.dotnet\8.0.20~x64~aspnetcore\dotnet.exe
 * Example id: 8.0.20~x64~aspnetcore
 */
export function getVersionFromInstallPathOrId(installPathOrId: string): string
{
    if (!installPathOrId) return '';

    // First, try to parse as a path (look for a version folder before dotnet[.exe])
    // Handles spaces and both Windows/Linux separators
    const pathParts = installPathOrId.split(/[/\\]/);
    for (let i = 0; i < pathParts.length; i++)
    {
        // Look for a part that matches version pattern (e.g., 8.0.20, 7.0.400)
        const match = pathParts[i].match(/^(\d+\.\d+\.\d+)(~.*)?$/);
        if (match)
        {
            return match[1];
        }
    }

    // If not found, try legacy id parsing (reuse getVersionFromLegacyInstallId)
    const legacyVersion = getVersionFromLegacyInstallId(installPathOrId);
    if (looksLikeRuntimeVersion(legacyVersion))
    {
        return legacyVersion;
    }

    // Fallback: try to find a version pattern anywhere in the string
    const fallbackMatch = installPathOrId.match(/(\d+\.\d+\.\d+)/);
    if (fallbackMatch)
    {
        return fallbackMatch[1];
    }
    return '';
}
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { DotnetCoreAcquisitionWorker } from '../Acquisition/DotnetCoreAcquisitionWorker';
import { DotnetInstall, looksLikeRuntimeVersion } from '../Acquisition/DotnetInstall';
import { DOTNET_INSTALL_MODE_LIST, DotnetInstallMode } from '../Acquisition/DotnetInstallMode';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { DotnetInstallType } from '../IDotnetAcquireContext';


export function getInstallIdCustomArchitecture(version: string, architecture: string | null | undefined, mode: DotnetInstallMode,
    installType: DotnetInstallType = 'local'): string
{
    if (architecture === null || architecture === 'null')
    {
        // Use the legacy method (no architecture) of installs
        return installType === 'global' ? `${version}-global` : version;
    }
    else if (architecture === undefined)
    {
        architecture = DotnetCoreAcquisitionWorker.defaultArchitecture();
    }

    return installType === 'global' ? `${version}-global~${architecture}${mode === 'aspnetcore' ? '~aspnetcore' : ''}` :
        `${version}~${architecture}${mode === 'aspnetcore' ? '~aspnetcore' : ''}`;
}

export function getInstallFromContext(ctx: IAcquisitionWorkerContext): DotnetInstall
{
    const acquireContext = ctx.acquisitionContext!;

    return {
        installId: getInstallIdCustomArchitecture(acquireContext.version, acquireContext.architecture, ctx.acquisitionContext.mode!,
            acquireContext.installType),
        version: acquireContext.version,
        architecture: acquireContext.architecture,
        isGlobal: acquireContext.installType ? acquireContext.installType === 'global' : false,
        installMode: ctx.acquisitionContext.mode!
    } as DotnetInstall;


}
export function isRuntimeInstallId(installId: string): boolean
{
    const installIdVersion = getVersionFromLegacyInstallId(installId);
    return !(DOTNET_INSTALL_MODE_LIST.filter((x: string) => x !== 'runtime')).some((mode) => installId.includes(mode))
        && looksLikeRuntimeVersion(installIdVersion);
}

export function isGlobalLegacyInstallId(installId: string): boolean
{
    return installId.toLowerCase().includes('global');
}

export function getArchFromLegacyInstallId(installId: string): string | undefined
{
    const splitId = installId.split('~');
    if ((splitId?.length ?? 0) >= 2)
    {
        return splitId[1];
    }
    return undefined;
}

export function getVersionFromLegacyInstallId(installId: string): string
{
    if (isGlobalLegacyInstallId(installId))
    {
        const splitId = installId.split('-');
        return splitId[0];
    }
    else if (installId.includes('~'))
    {
        const splitId = installId.split('~');
        return splitId[0];
    }
    else // legacy, legacy install id (before it included the arch)
    {
        return installId;
    }
}

/**
 * @deprecated This function is for legacy install ids only. Do not use for new code.
 */
export function getAssumedInstallInfo(id: string, mode: DotnetInstallMode | null): DotnetInstall
{
    return {
        installId: id,
        version: getVersionFromLegacyInstallId(id),
        architecture: getArchFromLegacyInstallId(id) ?? DotnetCoreAcquisitionWorker.defaultArchitecture(),
        isGlobal: isGlobalLegacyInstallId(id),

        // This code is for legacy install strings where the info was not recorded.
        // At the time only runtime or sdk was permitted and there were no outlier edge case versions that would be wrong.
        // So this assumption can hold true below. Do not utilize this going forward for new code.
        installMode: mode ?? isRuntimeInstallId(id) ? 'runtime' : 'sdk'
    };
}

