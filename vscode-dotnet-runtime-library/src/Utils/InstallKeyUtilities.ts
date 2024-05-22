/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { DotnetCoreAcquisitionWorker } from '../Acquisition/DotnetCoreAcquisitionWorker';
import { looksLikeRuntimeVersion } from '../Acquisition/DotnetInstall';
import { DotnetInstall } from '../Acquisition/DotnetInstall';
import { DOTNET_INSTALL_MODE_LIST } from '../Acquisition/DotnetInstallMode';
import { IAcquisitionWorkerContext } from '../Acquisition/IAcquisitionWorkerContext';
import * as os from 'os';

export function getInstallKeyFromContext(ctx : IAcquisitionWorkerContext | undefined | null) : DotnetInstall | null
{
    if(!ctx || !ctx.acquisitionContext)
    {
        return null;
    }

    const acquireContext = ctx.acquisitionContext!;

    return {
        installKey : DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(acquireContext.version, acquireContext.architecture,
            acquireContext.installType ? acquireContext.installType === 'global' : false),
        version: acquireContext.version,
        architecture: acquireContext.architecture,
        isGlobal: acquireContext.installType ? acquireContext.installType === 'global' : false,
        installMode: ctx.installMode
    } as DotnetInstall;


}
export function isRuntimeInstallKey(installKey: string): boolean {
    const installKeyVersion = getVersionFromLegacyInstallKey(installKey);
    return !(DOTNET_INSTALL_MODE_LIST.filter( (x : string) => x !== 'runtime')).some( (mode) => installKey.includes(mode))
        && looksLikeRuntimeVersion(installKeyVersion);
}

export function isGlobalLegacyInstallKey(installKey: string): boolean {
    return installKey.toLowerCase().includes('global');
}export function getArchFromLegacyInstallKey(installKey: string): string | undefined {
    const splitKey = installKey.split('~');
    if (splitKey.length === 2) {
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
export function installKeyStringToDotnetInstall(context : IAcquisitionWorkerContext, key: string): DotnetInstall {
    return {
        installKey: key,
        version: getVersionFromLegacyInstallKey(key),
        architecture: getArchFromLegacyInstallKey(key) ?? os.arch(),
        isGlobal: isGlobalLegacyInstallKey(key),
        installMode: context.installMode
    };
}

