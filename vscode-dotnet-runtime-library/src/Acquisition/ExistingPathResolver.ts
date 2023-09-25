/*---------------------------------------------------------------------------------------------
*  Licensed to the .NET Foundation under one or more agreements.
*  The .NET Foundation licenses this file to you under the MIT license.
*--------------------------------------------------------------------------------------------*/

import { IWindowDisplayWorker } from '../EventStream/IWindowDisplayWorker';
import { IDotnetAcquireResult } from '../IDotnetAcquireResult';
import { IExistingPath } from '../IExtensionContext';

export class ExistingPathResolver {
    public resolveExistingPath(existingPaths: IExistingPath[] | undefined, extensionId: string | undefined, windowDisplayWorker: IWindowDisplayWorker): IDotnetAcquireResult | undefined {
        if (existingPaths) {
            if (!extensionId) {
                windowDisplayWorker.showWarningMessage(
                    'Ignoring existing .NET paths defined in settings.json because requesting extension does not define its extension ID. Please file a bug against the requesting extension.',
                    () => { /* No callback */ },
                );
                return;
            }
            const existingPath = existingPaths.filter((pair) => pair.extensionId === extensionId);
            if (existingPath && existingPath.length > 0) {
                return { dotnetPath: existingPath![0].path };
            }
        }
    }
}
