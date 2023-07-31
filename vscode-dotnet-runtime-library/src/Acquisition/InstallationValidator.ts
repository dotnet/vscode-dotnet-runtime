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
    public validateDotnetInstall(version: string, dotnetPath: string, isDotnetFolder = false): void {
        const dotnetValidationFailed = `Validation of .dotnet installation for version ${version} failed:`;
        const folder = path.dirname(dotnetPath);

        if(!isDotnetFolder)
        {
            this.assertOrThrowError(fs.existsSync(folder),
            `${dotnetValidationFailed} Expected installation folder ${folder} does not exist.`, version, dotnetPath);

            this.assertOrThrowError(fs.existsSync(dotnetPath),
                `${dotnetValidationFailed} Expected executable does not exist at "${dotnetPath}"`, version, dotnetPath);

            this.assertOrThrowError(fs.lstatSync(dotnetPath).isFile(),
                `${dotnetValidationFailed} Expected executable file exists but is not a file: "${dotnetPath}"`, version, dotnetPath);
        }
        else
        {
            this.assertOrThrowError(fs.existsSync(folder),
            `${dotnetValidationFailed} Expected dotnet folder ${dotnetPath} does not exist.`, version, dotnetPath);

            this.assertOrThrowError(fs.readdirSync(folder).length !== 0,
            `${dotnetValidationFailed} The dotnet folder is empty "${dotnetPath}"`, version, dotnetPath);
        }

        this.eventStream.post(new DotnetInstallationValidated(version));
    }

    private assertOrThrowError(check: boolean, message: string, version: string, dotnetPath: string) {
        if (!check) {
            this.eventStream.post(new DotnetInstallationValidationError(new Error(message), version, dotnetPath));
            throw new Error(message);
        }
    }
}
