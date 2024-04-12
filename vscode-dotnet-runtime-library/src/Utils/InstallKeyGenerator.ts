/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { DotnetCoreAcquisitionWorker } from '../Acquisition/DotnetCoreAcquisitionWorker';
import { DotnetInstall, looksLikeRuntimeVersion } from '../Acquisition/IInstallationRecord';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';

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