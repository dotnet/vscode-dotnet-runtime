/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import * as path from 'path';
import {
    DotnetInstallationValidated,
    DotnetInstallationValidationError,
} from '../EventStream/EventStreamEvents';
import { IInstallationValidator } from './IInstallationValidator';

export class InstallationValidator extends IInstallationValidator {
    public validateDotnetInstall(installKey: string, dotnetPath: string): void {
        const dotnetValidationFailed = `Validation of .dotnet installation for version ${installKey} failed:`;
        const folder = path.dirname(dotnetPath);

        this.assertOrThrowError(fs.existsSync(folder),
            `${dotnetValidationFailed} Expected installation folder ${folder} does not exist.`, installKey, dotnetPath);

        this.assertOrThrowError(fs.existsSync(dotnetPath),
            `${dotnetValidationFailed} Expected executable does not exist at "${dotnetPath}"`, installKey, dotnetPath);

        this.assertOrThrowError(fs.lstatSync(dotnetPath).isFile(),
            `${dotnetValidationFailed} Expected executable file exists but is not a file: "${dotnetPath}"`, installKey, dotnetPath);

        this.eventStream.post(new DotnetInstallationValidated(installKey));
    }

    private assertOrThrowError(check: boolean, message: string, installKey: string, dotnetPath: string) {
        if (!check) {
            this.eventStream.post(new DotnetInstallationValidationError(new Error(message), installKey, dotnetPath));
            throw new Error(message);
        }
    }
}
