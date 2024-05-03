/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { DotnetCoreAcquisitionWorker } from '../Acquisition/DotnetCoreAcquisitionWorker';
import { looksLikeRuntimeVersion } from '../Acquisition/DotnetInstall';
import { DotnetInstall } from '../Acquisition/DotnetInstall';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';
import * as os from "os";

export function getInstallKeyFromContext(ctx : IDotnetAcquireContext | undefined | null) : DotnetInstall | null
{
    if(!ctx)
    {
        return null;
    }

    return {
        installKey : DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(ctx.version, ctx.architecture,
            ctx.installType ? ctx.installType === 'global' : false),
        version: ctx.version,
        architecture: ctx.architecture,
        isGlobal: ctx.installType ? ctx.installType === 'global' : false,
        isRuntime: looksLikeRuntimeVersion(ctx.version)
    } as DotnetInstall;


}
export function isRuntimeInstallKey(installKey: string): boolean {
    const installKeyVersion = getVersionFromLegacyInstallKey(installKey);
    return !installKey.includes('sdk') && looksLikeRuntimeVersion(installKeyVersion);
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
export function installKeyStringToDotnetInstall(key: string): DotnetInstall {
    return {
        installKey: key,
        version: getVersionFromLegacyInstallKey(key),
        architecture: getArchFromLegacyInstallKey(key) ?? os.arch(),
        isGlobal: isGlobalLegacyInstallKey(key),
        isRuntime: isRuntimeInstallKey(key)
    };
}

