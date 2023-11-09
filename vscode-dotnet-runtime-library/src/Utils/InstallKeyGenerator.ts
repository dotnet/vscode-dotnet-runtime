/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { DotnetCoreAcquisitionWorker } from '../Acquisition/DotnetCoreAcquisitionWorker';
import { IDotnetAcquireContext } from '../IDotnetAcquireContext';

export function getInstallKeyFromContext(ctx : IDotnetAcquireContext) : string
{
    return DotnetCoreAcquisitionWorker.getInstallKeyCustomArchitecture(ctx.version, ctx.architecture,
        ctx.installType ? ctx.installType === 'global' : false);
}