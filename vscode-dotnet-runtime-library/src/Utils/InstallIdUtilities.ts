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


export function getInstallIdCustomArchitecture(version : string, architecture: string | null | undefined, mode: DotnetInstallMode,
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
        installId : getInstallIdCustomArchitecture(acquireContext.version, acquireContext.architecture, ctx.acquisitionContext.mode!,
            acquireContext.installType),
        version: acquireContext.version,
        architecture: acquireContext.architecture,
        isGlobal: acquireContext.installType ? acquireContext.installType === 'global' : false,
        installMode: ctx.acquisitionContext.mode!
    } as DotnetInstall;


}
export function isRuntimeInstallId(installId: string): boolean {
    const installIdVersion = getVersionFromLegacyInstallId(installId);
    return !(DOTNET_INSTALL_MODE_LIST.filter( (x : string) => x !== 'runtime')).some( (mode) => installId.includes(mode))
        && looksLikeRuntimeVersion(installIdVersion);
}

export function isGlobalLegacyInstallId(installId: string): boolean {
    return installId.toLowerCase().includes('global');
}

export function getArchFromLegacyInstallId(installId: string): string | undefined {
    const splitKey = installId.split('~');
    if (splitKey.length >= 2) {
        return splitKey[1];
    }
    return undefined;
}

export function getVersionFromLegacyInstallId(installId: string): string {
    if (isGlobalLegacyInstallId(installId)) {
        const splitKey = installId.split('-');
        return splitKey[0];
    }
    else if (installId.includes('~')) {
        const splitKey = installId.split('~');
        return splitKey[0];
    }
    else // legacy, legacy install key (before it included the arch)
    {
        return installId;
    }
}

/**
 * @deprecated This function is for legacy install keys only. Do not use for new code.
 */
export function getAssumedInstallInfo(key: string, mode : DotnetInstallMode | null): DotnetInstall {
    return {
        installId: key,
        version: getVersionFromLegacyInstallId(key),
        architecture: getArchFromLegacyInstallId(key) ?? DotnetCoreAcquisitionWorker.defaultArchitecture(),
        isGlobal: isGlobalLegacyInstallId(key),

        // This code is for legacy install strings where the info was not recorded.
        // At the time only runtime or sdk was permitted and there were no outlier edge case versions that would be wrong.
        // So this assumption can hold true below. Do not utilize this going forward for new code.
        installMode: mode ?? isRuntimeInstallId(key) ? 'runtime' : 'sdk'
    };
}

