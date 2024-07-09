/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { DotnetCoreAcquisitionWorker } from '../Acquisition/DotnetCoreAcquisitionWorker';
import { looksLikeRuntimeVersion } from '../Acquisition/DotnetInstall';
import { DotnetInstall } from '../Acquisition/DotnetInstall';
import { DOTNET_INSTALL_MODE_LIST, DotnetInstallMode } from '../Acquisition/DotnetInstallMode';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import { DotnetInstallType } from '../IDotnetAcquireContext';


export function getInstallKeyCustomArchitecture(version : string, architecture: string | null | undefined, mode: DotnetInstallMode,
    installType : DotnetInstallType = 'local') : string
{
    if(architecture === null || architecture === 'null')
    {
        // Use the legacy method (no architecture) of installs
        return installType === 'global' ? `${version}-global` : version;
    }
    else if(architecture === undefined)
    {
        architecture = DotnetCoreAcquisitionWorker.defaultArchitecture();
    }

    return installType === 'global' ? `${version}-global~${architecture}${mode === 'aspnetcore' ? '~aspnetcore' : ''}` :
        `${version}~${architecture}${mode === 'aspnetcore' ? '~aspnetcore' : ''}`;
}

export function getInstallFromContext(ctx : IAcquisitionWorkerContext) : DotnetInstall
{
    const acquireContext = ctx.acquisitionContext!;

    return {
        installKey : getInstallKeyCustomArchitecture(acquireContext.version, acquireContext.architecture, ctx.acquisitionContext.mode!,
            acquireContext.installType),
        version: acquireContext.version,
        architecture: acquireContext.architecture,
        isGlobal: acquireContext.installType ? acquireContext.installType === 'global' : false,
        installMode: ctx.acquisitionContext.mode!
    } as DotnetInstall;


}
export function isRuntimeInstallKey(installKey: string): boolean {
    const installKeyVersion = getVersionFromLegacyInstallKey(installKey);
    return !(DOTNET_INSTALL_MODE_LIST.filter( (x : string) => x !== 'runtime')).some( (mode) => installKey.includes(mode))
        && looksLikeRuntimeVersion(installKeyVersion);
}

export function isGlobalLegacyInstallKey(installKey: string): boolean {
    return installKey.toLowerCase().includes('global');
}

export function getArchFromLegacyInstallKey(installKey: string): string | undefined {
    const splitKey = installKey.split('~');
    if (splitKey.length >= 2) {
        return splitKey[1];
    }
    return undefined;
}

export function getVersionFromLegacyInstallKey(installKey: string): string {
    if (isGlobalLegacyInstallKey(installKey)) {
        const splitKey = installKey.split('-');
        return splitKey[0];
    }
    else if (installKey.includes('~')) {
        const splitKey = installKey.split('~');
        return splitKey[0];
    }
    else // legacy, legacy install key (before it included the arch)
    {
        return installKey;
    }
}

/**
 * @deprecated This function is for legacy install keys only. Do not use for new code.
 */
export function getAssumedInstallInfo(key: string, mode : DotnetInstallMode | null): DotnetInstall {
    return {
        installKey: key,
        version: getVersionFromLegacyInstallKey(key),
        architecture: getArchFromLegacyInstallKey(key) ?? DotnetCoreAcquisitionWorker.defaultArchitecture(),
        isGlobal: isGlobalLegacyInstallKey(key),

        // This code is for legacy install strings where the info was not recorded.
        // At the time only runtime or sdk was permitted and there were no outlier edge case versions that would be wrong.
        // So this assumption can hold true below. Do not utilize this going forward for new code.
        installMode: mode ?? isRuntimeInstallKey(key) ? 'runtime' : 'sdk'
    };
}

